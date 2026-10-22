/**
 * build/plugin.ts
 * ----------------------------------------------------------------------------
 * The Vite plugin that turns your data folders into the page's data.
 *
 *   tracks/*.wig|bedGraph|bed(.gz) ─┐
 *   genome/chrom.sizes, *.fa        ├─► parse ─► encode ─► virtual:genome-data
 *   help/**.md + images             │                       (imported by src/main.ts)
 *   tracks.config.ts               ─┘
 *
 * Runs in Node during `npm run build` and `npm run dev` (dev re-runs it and
 * reloads the page whenever any of those files change).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { loadConfigFromFile, type Plugin, type ViteDevServer, normalizePath } from 'vite';
import type { Bundle, ChromInfo, SequenceBundle, TrackBundle, TrackFormat, TrackStyle } from '../shared/types';
import { DEFAULT_PALETTE, suggest, validateConfig, type BrowserConfig, type TrackOptions } from './config-schema';
import { parseWig } from './parse-wig';
import { parseBed } from './parse-bed';
import { parseFasta } from './parse-fasta';
import { encodeSignalChrom } from './pyramid';
import { buildHelp } from './help';
import { formatPosition, parsePosition } from '../src/core/coords';

const VIRTUAL_ID = 'virtual:genome-data';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const TRACK_EXT: Record<string, TrackFormat> = {
  '.wig': 'wig', '.bedgraph': 'bedGraph', '.bg': 'bedGraph', '.bed': 'bed',
};
const FASTA_RE = /\.(fa|fasta|fna)(\.gz)?$/i;

const c = { yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, dim: (s: string) => `\x1b[2m${s}\x1b[0m`, green: (s: string) => `\x1b[32m${s}\x1b[0m` };

/** "atac.bedGraph.gz" → { id: "atac", ext: ".bedgraph" } */
export function trackIdFromFile(file: string): { id: string; ext: string } {
  let name = file.replace(/\.gz$/i, '');
  const ext = path.extname(name).toLowerCase();
  name = name.slice(0, name.length - ext.length);
  return { id: name.replace(/[^\w.-]/g, '_'), ext };
}

function readMaybeGz(file: string): { text: string; bytes: number } {
  const buf = fs.readFileSync(file);
  const raw = file.toLowerCase().endsWith('.gz') ? zlib.gunzipSync(buf) : buf;
  return { text: raw.toString('utf8'), bytes: buf.length };
}

export function parseChromSizes(text: string): ChromInfo[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [name, size] = l.split(/\s+/);
    return { name, size: Number(size) };
  }).filter((x) => x.name && Number.isFinite(x.size) && x.size > 0);
}

const DEFAULT_STYLE: Omit<TrackStyle, 'label' | 'color' | 'altColor'> = {
  height: 50, marginTop: 6, yLabel: '', viewLimits: null, autoscaleGroup: null,
  windowing: 'max', graphType: 'bar', mode: 'pack', hidden: false, itemRgb: false,
  centerLine: false, featureLabels: true, description: '', centerLabel: false,
  after: [], missingParentName: "",
};

async function loadUserConfig(root: string): Promise<{ config: BrowserConfig; file: string | null }> {
  const file = path.join(root, 'tracks.config.ts');
  if (!fs.existsSync(file)) return { config: {}, file: null };
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, file, root, 'silent');
  const config = (loaded?.config ?? {}) as BrowserConfig;
  validateConfig(config);
  return { config, file };
}

export interface BuildResult {
  bundle: Bundle;
  warnings: string[];
  watched: string[];
  summary: string[];
}

export async function buildBundle(root: string): Promise<BuildResult> {
  const warnings: string[] = [];
  const summary: string[] = [];
  const { config } = await loadUserConfig(root);

  // ---- genome -----------------------------------------------------------
  const sizesFile = path.join(root, config.genome?.chromSizes ?? 'genome/chrom.sizes');
  if (!fs.existsSync(sizesFile)) throw new Error(`chrom.sizes not found at ${path.relative(root, sizesFile)}. See DEVELOPER.md "Genome files".`);
  const chroms = parseChromSizes(fs.readFileSync(sizesFile, 'utf8'));
  if (!chroms.length) throw new Error(`${path.relative(root, sizesFile)} contains no chromosomes.`);
  const chromSizes = new Map(chroms.map((x) => [x.name, x.size]));

  let sequence: SequenceBundle | null = null;
  let fastaFile: string | null = null;
  if (config.genome?.fasta !== false) {
    if (typeof config.genome?.fasta === 'string') {
      fastaFile = path.join(root, config.genome.fasta);
      if (!fs.existsSync(fastaFile)) throw new Error(`genome.fasta "${config.genome.fasta}" not found.`);
    } else {
      const dir = path.join(root, 'genome');
      const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => FASTA_RE.test(f)).sort() : [];
      if (found.length > 1) warnings.push(`Several FASTA files in genome/; using ${found[0]}. Set genome.fasta to choose.`);
      if (found.length) fastaFile = path.join(dir, found[0]);
    }
  }
  if (fastaFile) {
    const { text } = readMaybeGz(fastaFile);
    const fa = parseFasta(text, chromSizes);
    warnings.push(...fa.warnings.map((w) => `${path.basename(fastaFile!)}: ${w}`));
    if (fa.records.length) {
      sequence = {
        file: path.relative(root, fastaFile),
        label: config.sequenceTrack?.label ?? 'Sequence',
        hidden: config.sequenceTrack?.hidden ?? false,
        records: fa.records,
      };
      summary.push(`sequence   ${path.basename(fastaFile)}  ${(fa.packedBytes / 1048576).toFixed(2)} MB packed`);
    }
  }

  // ---- discover tracks ----------------------------------------------------
  const tracksDir = path.resolve(root, config.tracksDir ?? 'tracks');
  const files = fs.existsSync(tracksDir)
    ? fs.readdirSync(tracksDir).filter((f) => TRACK_EXT[trackIdFromFile(f).ext]).sort((a, b) => a.localeCompare(b))
    : [];
  const byKey = new Map<string, string>();
  for (const f of files) { byKey.set(f, f); byKey.set(trackIdFromFile(f).id, f); }

  const cfgTracks = config.tracks ?? {};
  const ordered: string[] = [];
  const optsFor = new Map<string, TrackOptions>();
  const missingRefs: string[] = [];
  for (const [key, opts] of Object.entries(cfgTracks)) {
    const f = byKey.get(key);
    if (!f) { missingRefs.push(`"${key}"${suggest(key, files)}`); continue; }
    if (!ordered.includes(f)) ordered.push(f);
    optsFor.set(f, opts);
  }
  if (missingRefs.length) {
    throw new Error(`tracks.config.ts refers to file(s) not found in tracks/: ${missingRefs.join(', ')}`);
  }
  const unconfigured = files.filter((f) => !ordered.includes(f));
  ordered.push(...unconfigured);
  if (unconfigured.length && Object.keys(cfgTracks).length) {
    summary.push(c.dim(`using defaults for: ${unconfigured.join(', ')}`));
  }
  if (!files.length) warnings.push('tracks/ has no .wig, .bedGraph or .bed files; the viewer will be empty.');

  // ---- parse tracks -------------------------------------------------------
  const tracks: TrackBundle[] = [];
  const seenIds = new Set<string>();
  ordered.forEach((file, i) => {
    const { id, ext } = trackIdFromFile(file);
    if (seenIds.has(id)) throw new Error(`Two track files share the id "${id}". Rename one of them.`);
    seenIds.add(id);
    const { text, bytes } = readMaybeGz(path.join(tracksDir, file));
    const format = TRACK_EXT[ext];
    const color = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
    const base: TrackStyle = { ...DEFAULT_STYLE, label: id, color, altColor: color };
    const user = (optsFor.get(file) ?? {}) as Partial<TrackStyle>;
    const resolve = (fromFile: Partial<TrackStyle>): TrackStyle => {
      const s = { ...base, ...fromFile, ...user };
      if (!user.altColor && !fromFile.altColor) s.altColor = s.color;
      return s;
    };

    if (format === 'bed') {
      const p = parseBed(text, chromSizes);
      warnings.push(...p.warnings.map((w) => `${file}: ${w}`));
      const style = resolve(p.style);
      if (p.style.itemRgb === undefined && user.itemRgb === undefined) {
        style.itemRgb = [...p.byChrom.values()].some((ch) => ch.rgb.some((x) => x));
      }
      tracks.push({
        id, file, format, kind: 'bed', style,
        stats: { chroms: [...p.byChrom.keys()], count: p.count, bedFields: p.fields, fileBytes: bytes },
        bed: Object.fromEntries(p.byChrom),
      });
      summary.push(`bed        ${file}  ${p.count.toLocaleString()} features`);
    } else {
      const p = parseWig(text, chromSizes);
      warnings.push(...p.warnings.map((w) => `${file}: ${w}`));
      const signal = Object.fromEntries([...p.byChrom].map(([ch, r]) => [ch, encodeSignalChrom(r, chromSizes.get(ch)!)]));
      tracks.push({
        id, file, format: p.format, kind: 'signal', style: resolve(p.style),
        stats: { chroms: [...p.byChrom.keys()], count: p.count, valueMin: p.min, valueMax: p.max, fileBytes: bytes },
        signal,
      });
      summary.push(`${p.format.padEnd(10)} ${file}  ${p.count.toLocaleString()} intervals`);
    }
  });

  // ---- resolve `after`: file names or ids → ids; reject unknown names and loops
  const idByKey = new Map<string, string>();
  for (const t of tracks) { idByKey.set(t.file, t.id); idByKey.set(t.id, t.id); }
  if (sequence) idByKey.set('sequence', 'sequence');
  for (const t of tracks) {
    const raw = t.style.after as unknown as string | string[] | undefined;
    const names = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    t.style.after = names.map((n) => {
      const id = idByKey.get(n);
      if (!id) throw new Error(`tracks["${t.file}"].after refers to "${n}", which is not a track.${suggest(n, tracks.map((x) => x.file))}`);
      if (id === t.id) throw new Error(`tracks["${t.file}"].after names the track itself.`);
      return id;
    });
  }
  const loop = findAfterCycle(tracks);
  if (loop) throw new Error(`"after" settings form a loop: ${loop.join(' → ')}`);

  // ---- default position --------------------------------------------------
  let defaultPosition: string;
  if (config.defaultPosition) {
    const pos = parsePosition(config.defaultPosition, chroms);
    if (!pos) throw new Error(`defaultPosition "${config.defaultPosition}" is not a valid position for this genome.`);
    defaultPosition = formatPosition(pos.chrom, pos.start, pos.end);
  } else {
    defaultPosition = autoPosition(tracks, sequence, chroms);
  }

  // ---- help ----------------------------------------------------------------
  const title = config.title ?? 'Genome Browser';
  const help = buildHelp({ root, tracks, sequence, title });
  warnings.push(...help.warnings);

  const bundle: Bundle = {
    buildHash: '',
    title,
    subtitle: config.subtitle ?? '',
    defaultPosition,
    chroms,
    tracks,
    sequence,
    help: { html: help.html, toc: help.toc },
    goatcounter: config.analytics?.goatcounter ?? null,
  };
  const json = JSON.stringify(bundle);
  bundle.buildHash = crypto.createHash('sha1').update(json).digest('hex').slice(0, 10);

  const mb = json.length / 1048576;
  const limit = config.maxDataMB ?? 200;
  if (mb > limit) throw new Error(`Bundled data is ${mb.toFixed(1)} MB, above maxDataMB (${limit}). See DEVELOPER.md "Large data".`);
  if (mb > 50) warnings.push(`Bundled data is ${mb.toFixed(1)} MB; the page may load slowly. See DEVELOPER.md "Large data".`);
  summary.push(`total data ${mb.toFixed(2)} MB (help images ${(help.imageBytes / 1048576).toFixed(2)} MB)`);

  const watched = [sizesFile, tracksDir, path.join(root, 'help'), path.join(root, 'genome'), path.join(root, 'tracks.config.ts')];
  return { bundle, warnings, watched, summary };
}

/** Pick a start region: the extent of data on the chromosome with the most data. */
function autoPosition(tracks: TrackBundle[], seq: SequenceBundle | null, chroms: ChromInfo[]): string {
  const extent = new Map<string, { s: number; e: number; n: number }>();
  const maxOf = (a: ArrayLike<number>) => { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };
  const add = (ch: string, s: number, e: number, n: number) => {
    const x = extent.get(ch) ?? { s: Infinity, e: -Infinity, n: 0 };
    x.s = Math.min(x.s, s); x.e = Math.max(x.e, e); x.n += n;
    extent.set(ch, x);
  };
  for (const t of tracks) {
    for (const [ch, d] of Object.entries(t.bed ?? {})) if (d.n) add(ch, d.starts[0], maxOf(d.ends), d.n);
    for (const [ch, d] of Object.entries(t.signal ?? {})) {
      if (!d.n) continue;
      const u32 = (s: string) => { const b = Buffer.from(s, 'base64'); return new Uint32Array(Uint8Array.from(b).buffer); };
      const ends = u32(d.ends);
      add(ch, u32(d.starts)[0], maxOf(ends), d.n);
    }
  }
  if (seq) for (const r of seq.records) add(r.chrom, r.offset, r.offset + r.length, 1);
  let best: [string, { s: number; e: number; n: number }] | null = null;
  for (const entry of extent) if (!best || entry[1].n > best[1].n) best = entry;
  if (!best) return formatPosition(chroms[0].name, 0, Math.min(chroms[0].size, 1_000_000));
  const pad = Math.round((best[1].e - best[1].s) * 0.02);
  const size = chroms.find((x) => x.name === best![0])!.size;
  return formatPosition(best[0], Math.max(0, best[1].s - pad), Math.min(size, best[1].e + pad));
}

/** Ids along a loop in the `after` graph, or null if there is none. */
function findAfterCycle(tracks: TrackBundle[]): string[] | null {
  const parents = new Map(tracks.map((t) => [t.id, t.style.after]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const p of parents.get(id) ?? []) {
      const found = visit(p);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };
  for (const t of tracks) {
    const found = visit(t.id);
    if (found) return found;
  }
  return null;
}

/** The Vite plugin. */
export function genomeData(options: { root?: string } = {}): Plugin {
  let root = options.root ?? process.cwd();
  let cached: Promise<BuildResult> | null = null;
  let server: ViteDevServer | null = null;
  let watched: string[] = [];

  const get = () => {
    if (!cached) {
      cached = buildBundle(root).then((r) => {
        console.log('\n' + c.green('genome data') + '\n  ' + r.summary.join('\n  '));
        if (r.warnings.length) console.log(c.yellow(`  ${r.warnings.length} warning(s):\n    - ${r.warnings.join('\n    - ')}`));
        console.log('');
        return r;
      });
      cached.catch(() => { cached = null; });
    }
    return cached;
  };

  return {
    name: 'genome-data',
    configResolved(cfg) { if (!options.root) root = cfg.root; },
    resolveId(id) { return id === VIRTUAL_ID ? RESOLVED_ID : null; },
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const r = await get();
      if (server) {
        watched = r.watched.map((p) => normalizePath(p));
        server.watcher.add(r.watched);
      }
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(r.bundle))});`;
    },
    async transformIndexHtml(html) {
      const { bundle } = await get();
      return html.replace(/%APP_TITLE%/g, bundle.title.replace(/</g, '&lt;'));
    },
    configureServer(s) {
      server = s;
      watched = ['tracks', 'genome', 'help', 'tracks.config.ts'].map((d) => normalizePath(path.join(root, d)));
      s.watcher.add(watched);
      const onChange = (file: string) => {
        const f = normalizePath(file);
        if (!watched.some((d) => f === d || f.startsWith(d + '/'))) return;
        cached = null;
        const mod = server!.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server!.moduleGraph.invalidateModule(mod);
        server!.ws.send({ type: 'full-reload' });
      };
      s.watcher.on('change', onChange);
      s.watcher.on('add', onChange);
      s.watcher.on('unlink', onChange);
    },
  };
}
