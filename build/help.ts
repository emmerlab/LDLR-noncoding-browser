/**
 * build/help.ts
 * ----------------------------------------------------------------------------
 * Builds the Help page from markdown at build time (no markdown library ships
 * to the browser):
 *
 *   help/index.md               general docs, shown first
 *   help/tracks/<track-id>.md   one optional file per track
 *
 * - Images (markdown `![alt](path "caption")` or raw <img src>) are read from
 *   disk and inlined as data: URIs. Paths are relative to the .md file.
 *   A missing image is a build error.
 * - Every heading gets a stable id; h2/h3 of index.md become the TOC.
 * - Every track gets a section with an auto-generated facts box, followed by
 *   its markdown if present. The viewer links track names to `#/help/track-<id>`.
 * - In-page links like [ATAC](#track-atac) or [Setup](#setup) are rewritten to
 *   the router form `#/help/...` automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { HelpBundle, SequenceBundle, TocEntry, TrackBundle } from '../shared/types';

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
};
export const IMAGE_WARN_BYTES = 500 * 1024;

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-') || 'section';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Ctx {
  md: MarkdownIt;
  used: Set<string>;
  warnings: string[];
  imageBytes: number;
}

function uniqueId(ctx: Ctx, base: string): string {
  let id = base;
  for (let n = 2; ctx.used.has(id); n++) id = `${base}-${n}`;
  ctx.used.add(id);
  return id;
}

function inlineImage(ctx: Ctx, src: string, mdFile: string, line: number, helpRoot: string): string {
  if (/^(data:|https?:)/i.test(src)) {
    if (/^https?:/i.test(src)) ctx.warnings.push(`${rel(mdFile)}:${line} uses a remote image (${src}); it will not load offline.`);
    return src;
  }
  const clean = decodeURI(src.split(/[?#]/)[0]);
  const abs = clean.startsWith('/') ? path.join(helpRoot, clean) : path.resolve(path.dirname(mdFile), clean);
  if (!fs.existsSync(abs)) {
    throw new Error(`Help image not found: "${src}" in ${rel(mdFile)} line ${line} (looked for ${rel(abs)}).`);
  }
  const mime = MIME[path.extname(abs).toLowerCase()];
  if (!mime) throw new Error(`Unsupported image type "${path.extname(abs)}" in ${rel(mdFile)} line ${line}. Use png, jpg, gif, webp or svg.`);
  const buf = fs.readFileSync(abs);
  ctx.imageBytes += buf.length;
  if (buf.length > IMAGE_WARN_BYTES) {
    ctx.warnings.push(`Help image ${rel(abs)} is ${(buf.length / 1024).toFixed(0)} KB; consider shrinking it (see DEVELOPER.md "Images").`);
  }
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const rel = (p: string) => path.relative(process.cwd(), p) || p;

/**
 * Render one markdown file.
 * headingShift: added to every heading level (track files are nested under a track title).
 * toc: when given, h2 entries (with h3 children) are appended to it.
 */
function renderMarkdown(ctx: Ctx, file: string, helpRoot: string, headingShift: number, toc?: TocEntry[]): { html: string; title: string } {
  const env = {};
  const tokens = ctx.md.parse(fs.readFileSync(file, 'utf8'), env);
  let title = '';
  let lastLine = 1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.map) lastLine = t.map[0] + 1;
    if (t.type === 'heading_open') {
      const level = Number(t.tag.slice(1));
      const text = tokens[i + 1]?.content ?? '';
      const id = uniqueId(ctx, slugify(text));
      t.attrSet('id', id);
      if (level === 1 && !title) title = text;
      if (toc && level === 2) toc.push({ id, text, children: [] });
      if (toc && level === 3 && toc.length) toc[toc.length - 1].children.push({ id, text, children: [] });
      const newTag = `h${Math.min(6, level + headingShift)}`;
      t.tag = newTag;
      const close = tokens.slice(i).find((x) => x.type === 'heading_close');
      if (close) close.tag = newTag;
    }
    if (t.type === 'html_block') t.content = rewriteHtmlImages(ctx, t.content, file, lastLine, helpRoot);
    if (t.type === 'inline' && t.children) walkInline(ctx, t.children, file, lastLine, helpRoot);
  }
  let html = ctx.md.renderer.render(tokens, ctx.md.options, env);
  // A paragraph holding only an image with a title becomes a captioned figure.
  html = html.replace(
    /<p><img src="([^"]*)" alt="([^"]*)" title="([^"]*)"\s*\/?><\/p>/g,
    '<figure><img src="$1" alt="$2"><figcaption>$3</figcaption></figure>',
  );
  return { html, title };
}

function walkInline(ctx: Ctx, children: Token[], file: string, line: number, helpRoot: string) {
  for (const c of children) {
    if (c.type === 'image') {
      const src = c.attrGet('src') ?? '';
      c.attrSet('src', inlineImage(ctx, src, file, line, helpRoot));
    } else if (c.type === 'html_inline') {
      c.content = rewriteHtmlImages(ctx, c.content, file, line, helpRoot);
    } else if (c.type === 'link_open') {
      const href = c.attrGet('href') ?? '';
      if (href.startsWith('#') && !href.startsWith('#/')) c.attrSet('href', `#/help/${href.slice(1)}`);
    }
  }
}

function rewriteHtmlImages(ctx: Ctx, html: string, file: string, line: number, helpRoot: string): string {
  return html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi, (_m, pre, q, src) =>
    `${pre}${q}${inlineImage(ctx, src, file, line, helpRoot)}${q}`);
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function factsBox(t: TrackBundle): string {
  const rows: [string, string][] = [
    // ['Source file', `<code>${esc(t.file)}</code>`],
    // ['Format', t.format === 'bed' ? `BED${t.stats.bedFields ?? ''}` : t.format],
    [t.kind === 'signal' ? 'Data intervals' : 'Features', fmt(t.stats.count)],
    ['Chromosomes', esc(t.stats.chroms.slice(0, 6).join(', ') + (t.stats.chroms.length > 6 ? ` and ${t.stats.chroms.length - 6} more` : ''))],
  ];
  if (t.kind === 'signal') rows.push(['Value range', `${+(t.stats.valueMin ?? 0).toPrecision(4)} to ${+(t.stats.valueMax ?? 0).toPrecision(4)}`]);
  if (t.style.description) rows.push(['Description', esc(t.style.description)]);
  return `<dl class="facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

export function buildHelp(opts: {
  root: string;
  tracks: TrackBundle[];
  sequence: SequenceBundle | null;
  title: string;
}): HelpBundle & { warnings: string[]; imageBytes: number; files: string[] } {
  const helpRoot = path.join(opts.root, 'help');
  const ctx: Ctx = {
    md: new MarkdownIt({ html: true, linkify: true, typographer: true }),
    used: new Set(['tracks']),
    warnings: [],
    imageBytes: 0,
  };
  const files: string[] = [];
  const toc: TocEntry[] = [];
  let html = '';

  const indexFile = path.join(helpRoot, 'index.md');
  if (fs.existsSync(indexFile)) {
    files.push(indexFile);
    const r = renderMarkdown(ctx, indexFile, helpRoot, 0, toc);
    html += `<div class="help-intro">${r.html}</div>`;
  } else {
    html += `<div class="help-intro"><h1>${esc(opts.title)}</h1><p>Add <code>help/index.md</code> to write this page.</p></div>`;
    ctx.warnings.push('help/index.md not found; the Help page shows a placeholder intro.');
  }

  const trackToc: TocEntry = { id: 'tracks', text: 'Tracks', children: [] };
  let tracksHtml = '';
  const missing: string[] = [];

  const section = (id: string, label: string, color: string, facts: string, mdId: string) => {
    const anchor = uniqueId(ctx, `track-${id}`);
    trackToc.children.push({ id: anchor, text: label, children: [] });
    const mdFile = path.join(helpRoot, 'tracks', `${mdId}.md`);
    let body = '';
    if (fs.existsSync(mdFile)) {
      files.push(mdFile);
      body = renderMarkdown(ctx, mdFile, helpRoot, 3).html;
    } else {
      missing.push(`help/tracks/${mdId}.md`);
    }
    tracksHtml += `<section class="help-track" id="${anchor}">
<h3><span class="swatch" style="background:${esc(color)}"></span>${esc(label)}</h3>
${facts}${body}</section>`;
  };

  if (opts.sequence) {
    const seq = opts.sequence;
    const bases = seq.records.reduce((a, r) => a + r.length, 0);
    const facts = `<dl class="facts"><!-- dt>Source file</dt><dd><code>${esc(seq.file)}</code></dd --><!-- dt>Format</dt><dd>FASTA</dd --><dt>Bases</dt><dd>${fmt(bases)}</dd><dt>Regions</dt><dd>${seq.records.map((r) => `${esc(r.chrom)}:${fmt(r.offset + 1)}-${fmt(r.offset + r.length)}`).join(', ')}</dd></dl>`;
    section('sequence', seq.label, '#5b5f66', facts, 'sequence');
  }
  for (const t of opts.tracks) section(t.id, t.style.label || t.style.missingParentName || t.file, t.style.color, factsBox(t), t.id);

  if (missing.length) ctx.warnings.push(`No help text yet for: ${missing.join(', ')} (auto facts box shown instead).`);

  html += `<section class="help-tracks"><h2 id="tracks">Tracks</h2>${tracksHtml}</section>`;
  toc.push(trackToc);
  return { html, toc, warnings: ctx.warnings, imageBytes: ctx.imageBytes, files };
}
