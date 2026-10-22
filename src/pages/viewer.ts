/**
 * src/pages/viewer.ts
 * ----------------------------------------------------------------------------
 * The Viewer page. Builds the DOM, wires every interaction, and redraws all
 * tracks whenever the view or layout changes (at most once per frame).
 *
 *   toolbar      position box, ‹ › pan, Reset view, zoom slider (top right)
 *   axis         chromosome, ticks, scale bar
 *   track rows   gutter (name, hover grip + ×, y-axis) | data canvas
 *   tray         hidden tracks as chips (click = add at bottom, drag = drop into a slot)
 *
 * Mouse and keyboard
 *   horizontal scroll / shift+wheel   pan
 *   vertical scroll                   scrolls the page (never captured)
 *   alt/option + scroll               zoom around the pointer
 *   drag across the tracks            zoom to the selected region
 *   double-click                      zoom out 3x around the pointer
 *   click a BED feature               pinned details popup
 *   right-click a track name          display options
 *   ← / →                             pan 10%
 */
import type { TrackStyle } from '../../shared/types';
import { fmtInt, formatPosition, formatSpan, parsePosition } from '../core/coords';
import { bedInView, signalSummary, type PixelSummary } from '../data/query';
import type { BedFeature } from '../data/decode';
import { displayName, type Track } from '../data/tracks';
import { drawAxis, AXIS_HEIGHT } from '../render/axis';
import { drawBed, hitBed, layoutBed, type BedLayout } from '../render/bed';
import { resolveColor, sizeCanvas } from '../render/canvas';
import { drawSequence, sequenceBaseAt, BASE_COLORS } from '../render/sequence';
import { drawSignal, drawYAxis, niceRange, summaryRange } from '../render/signal';
import { helpHash } from '../router';
import type { Store } from '../state';
import { startDrag } from '../ui/drag';
import { openMenu, type MenuItem } from '../ui/menu';
import { closePopup, esc, hideTooltip, openPopup, showTooltip } from '../ui/tooltip';

/** Width of the y-axis area at the right of each track's gutter. */
const YAXIS_W = 46;
/** A drag shorter than this (px) is treated as a click, not a selection. */
const SELECT_MIN_PX = 3;
/** Wait this long after a click before acting, so a double-click can cancel it. */
const CLICK_DELAY = 250;

interface Row {
  el: HTMLElement;
  label: HTMLButtonElement;
  yaxis: HTMLCanvasElement;
  canvas: HTMLCanvasElement;
  /** Untruncated label text, and how many lines it was last fitted to (0 = refit). */
  fullLabel: string;
  labelLines: number;
}

type Hit =
  | { kind: 'signal'; sum: PixelSummary | null }
  | { kind: 'bed'; layout: BedLayout }
  | { kind: 'sequence' };

export interface Viewer {
  el: HTMLElement;
  /** Call when the page becomes visible (canvases need a size). */
  activate(): void;
  /** Call when another page is shown; stops redrawing and keyboard handling. */
  deactivate(): void;
}

export function createViewer(store: Store, defaultPosition: string): Viewer {
  const el = document.createElement('section');
  el.className = 'page page-viewer';
  el.innerHTML = `
    <div class="toolbar" role="toolbar" aria-label="Navigation">
      <form class="pos-form" autocomplete="off">
        <label class="visually-hidden" for="pos-input">Position</label>
        <input id="pos-input" class="pos-input" spellcheck="false" />
        <button type="submit" class="btn">Go</button>
      </form>
      <span class="span-readout" aria-live="polite"></span>
      <span class="pos-error" role="alert" hidden></span>
      <div class="btn-group">
        <button type="button" class="btn icon" data-act="left" title="Move left (←)" aria-label="Move left">‹</button>
        <button type="button" class="btn icon" data-act="right" title="Move right (→)" aria-label="Move right">›</button>
      </div>
      <button type="button" class="btn" data-act="reset" title="Back to the starting position and track layout">Reset view</button>
      <div class="zoom">
        <button type="button" class="btn icon" data-act="zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
        <input type="range" class="zoom-slider" min="0" max="1000" step="1" aria-label="Zoom" title="Zoom (or alt + scroll over the tracks)" />
        <button type="button" class="btn icon" data-act="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
      </div>
    </div>
    <div class="browser">
      <div class="axis-row"><div class="gutter"></div><div class="data"><canvas class="axis-canvas"></canvas></div></div>
      <div class="stack"></div>
      <p class="empty-note" hidden>Every track is hidden. Click a track below to bring it back.</p>
      <div class="overlay" aria-hidden="true">
        <div class="guide" hidden><span class="guide-label"></span></div>
        <div class="selection" hidden><span class="selection-label"></span></div>
        <div class="drop-indicator" hidden></div>
      </div>
    </div>
    <section class="tray" aria-labelledby="tray-title">
      <div class="tray-head">
        <h2 id="tray-title">Hidden tracks</h2>
        <button type="button" class="btn link" data-act="show-all">Show all</button>
      </div>
      <div class="chips"></div>
      <p class="tray-empty">No hidden tracks. Hover a track name and click × to hide it.</p>
    </section>
    <footer class="viewer-footer">version ${__APP_VERSION__} (last modified ${__BUILD_TIME__})</footer>`;

  const $ = <T extends HTMLElement>(sel: string) => el.querySelector(sel) as T;
  const posInput = $<HTMLInputElement>('.pos-input');
  const posError = $<HTMLElement>('.pos-error');
  const spanReadout = $<HTMLElement>('.span-readout');
  const slider = $<HTMLInputElement>('.zoom-slider');
  const browser = $<HTMLElement>('.browser');
  const axisData = $<HTMLElement>('.axis-row .data');
  const axisCanvas = $<HTMLCanvasElement>('.axis-canvas');
  const stack = $<HTMLElement>('.stack');
  const emptyNote = $<HTMLElement>('.empty-note');
  const overlay = $<HTMLElement>('.overlay');
  const guide = $<HTMLElement>('.guide');
  const guideLabel = $<HTMLElement>('.guide-label');
  const selection = $<HTMLElement>('.selection');
  const selectionLabel = $<HTMLElement>('.selection-label');
  const dropIndicator = $<HTMLElement>('.drop-indicator');
  const chips = $<HTMLElement>('.chips');
  const trayEmpty = $<HTMLElement>('.tray-empty');
  const showAllBtn = $<HTMLButtonElement>('[data-act="show-all"]');

  const rows = new Map<string, Row>();
  const hits = new Map<string, Hit>();
  let rafPending = false;
  let active = false;

  // ---------------------------------------------------------------- helpers

  const trackById = (id: string) => store.tracks.find((t) => t.id === id)!;
  const bpPerPx = () => (store.view.end - store.view.start) / store.dataWidth;
  const dataLeft = () => axisData.getBoundingClientRect().left;
  const posAtClientX = (clientX: number) => store.view.start + (clientX - dataLeft()) * bpPerPx();

  /** Keep in sync with .track-label line-height in layout.css. */
  const LABEL_LINE_HEIGHT = 14;
  /** Room kept free for the grip and × at the left of the gutter (px). */
  const TOOLS_RESERVE = 38;
    /** Put `text` into `el`, trimming it with "…" until it fits el's max width and height. */
  function fitText(el: HTMLElement, text: string) {
    const fits = () => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    el.textContent = text;
    if (fits()) return;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      el.textContent = text.slice(0, mid).trimEnd() + '…';
      if (fits()) lo = mid;
      else hi = mid - 1;
    }
    el.textContent = text.slice(0, lo).trimEnd() + '…';
  }

  /**
   * Fit a track name into as many lines as the track is tall. Desktop: use the full gutter
   * width when the label ends up entirely below the grip and ×; otherwise leave room for them.
   */
  function setLabelLines(r: Row, trackHeight: number) {
    const lines = Math.max(1, Math.floor(trackHeight / LABEL_LINE_HEIGHT));
    if (lines === r.labelLines) return;                   // already fitted for this height
    r.labelLines = lines;
    const el = r.label;
    const gutter = el.parentElement!;
    const tools = gutter.querySelector<HTMLElement>('.track-tools')!;
    const usable = gutter.clientWidth - (parseFloat(getComputedStyle(el).right) || 0);
    el.style.maxHeight = `${lines * LABEL_LINE_HEIGHT}px`;

    // Touch screens: the × sits mid-row, so always leave room for it.
    if (!window.matchMedia('(pointer: coarse)').matches) {
      el.style.maxWidth = `${usable - 4}px`;
      fitText(el, r.fullLabel);
      const labelTop = el.getBoundingClientRect().top - gutter.getBoundingClientRect().top;
      if (labelTop >= tools.offsetTop + tools.offsetHeight) return;   // clear of the tools: keep wide
    }
    el.style.maxWidth = `${usable - TOOLS_RESERVE}px`;
    fitText(el, r.fullLabel);
  }

  function scheduleRender() {
    if (rafPending || !active) return;
    rafPending = true;
    requestAnimationFrame(render);
  }

  function effectiveLabel(s: TrackStyle, visibleIds: Set<string>): string {
    if (!s.missingParentName || !s.after.length || s.after.some((p) => visibleIds.has(p))) return s.label;
    return s.missingParentName;
  }

  // --------------------------------------------------------------- toolbar

  const sliderToSpan = (v: number) => {
    const max = store.chromSize();
    const min = store.minSpan();
    return max * (min / max) ** (v / 1000);
  };
  const spanToSlider = (span: number) => {
    const max = store.chromSize();
    const min = store.minSpan();
    if (max <= min) return 1000;
    return (1000 * Math.log(span / max)) / Math.log(min / max);
  };

  function syncToolbar() {
    if (document.activeElement !== posInput) posInput.value = store.positionString();
    spanReadout.textContent = formatSpan(store.view.end - store.view.start);
    if (document.activeElement !== slider) slider.value = String(Math.round(spanToSlider(store.view.end - store.view.start)));
  }

  $<HTMLFormElement>('.pos-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const loc = parsePosition(posInput.value, store.chroms);
    if (!loc) {
      posError.textContent = 'Use a position like chr7:55,000,001-55,300,000 or a chromosome name.';
      posError.hidden = false;
      posInput.setAttribute('aria-invalid', 'true');
      return;
    }
    posError.hidden = true;
    posInput.removeAttribute('aria-invalid');
    posInput.blur();
    store.setView(loc);
  });
  posInput.addEventListener('input', () => { posError.hidden = true; posInput.removeAttribute('aria-invalid'); });

  const zoomCenter = (factor: number) => store.zoomAt(factor, (store.view.start + store.view.end) / 2);
  el.querySelector('.toolbar')!.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    const span = store.view.end - store.view.start;
    if (act === 'left') store.pan(-span * 0.5);
    if (act === 'right') store.pan(span * 0.5);
    if (act === 'zoom-in') zoomCenter(1 / 3);
    if (act === 'zoom-out') zoomCenter(3);
    if (act === 'reset') {
      store.resetLayout();
      const loc = parsePosition(defaultPosition, store.chroms);
      if (loc) store.setView(loc);
    }
  });
  slider.addEventListener('input', () => {
    const target = sliderToSpan(Number(slider.value));
    zoomCenter(target / (store.view.end - store.view.start));
  });

  // -------------------------------------------------------------- track rows

  function makeRow(t: Track): Row {
    const row = document.createElement('div');
    const openTrackMenu = (x: number, y: number) => {
      row.classList.add('menu-open');
      openMenu(x, y, menuFor(t), () => {
        // Keep the tools in place until the tap that closed the menu has finished,
        // so a tap on × still lands on it.
        const done = () => row.classList.remove('menu-open');
        window.addEventListener('click', done, { once: true });
        setTimeout(done, 700);   // fallback when no click follows (Escape, resize)
      });
    };
    row.className = 'track-row';
    row.dataset.id = t.id;
    row.innerHTML = `
      <div class="gutter">
        <div class="track-tools">
          <button type="button" class="grip" aria-label="Drag to reorder" title="Drag to reorder">
            <svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/></g></svg>
          </button>
          <button type="button" class="hide-btn" aria-label="Hide track" title="Hide track">×</button>
        </div>
        <button type="button" class="track-label"></button>
        <canvas class="yaxis"></canvas>
      </div>
      <div class="data"><canvas class="data-canvas"></canvas></div>`;
    const label = row.querySelector<HTMLButtonElement>('.track-label')!;
    label.title = `${displayName(t)}: hold or drag to reorder, click for options`;
    // Click (or tap) the name for the track menu; "About this track" in it opens the help.
    label.addEventListener('click', (e) => {
      const r = label.getBoundingClientRect();
      const fromKeyboard = e.detail === 0;          // Enter/Space: no pointer position
      openTrackMenu(fromKeyboard ? r.left : e.clientX, fromKeyboard ? r.bottom : e.clientY);
    });
    const beginReorder = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startDrag({
        event: e, label: displayName(t), color: resolveColor(store.styleOf(t).color),
        stack, indicator: dropIndicator, overlay, excludeId: t.id,
        onArm: () => row.classList.add('drag-armed'),
        onStart: () => row.classList.add('dragging'),
        onEnd: () => row.classList.remove('dragging', 'drag-armed'),
        onDrop: (i) => store.move(t.id, i),
      });
    };
        // Touch: tap the left side to reveal the red ×; tapping a × that was already showing hides the track.
    // Mouse: the × appears on hover and one click hides.
    const gutter = row.querySelector<HTMLElement>('.gutter')!;
    const hideBtn = row.querySelector<HTMLButtonElement>('.hide-btn')!;
    const SHOWING = ['tools-shown', 'menu-open', 'drag-armed', 'dragging'];
    let pressWasTouch = false;
    let toolsWereShowing = false;
    let shownTimer = 0;
    const showTools = () => {
      row.classList.add('tools-shown');
      clearTimeout(shownTimer);
      shownTimer = window.setTimeout(() => row.classList.remove('tools-shown'), 3000);
    };
    gutter.addEventListener('pointerdown', (e) => {
      pressWasTouch = e.pointerType === 'touch';
      toolsWereShowing = SHOWING.some((c) => row.classList.contains(c));   // state at the START of the tap
      if (!pressWasTouch && (e.target as HTMLElement).closest('.hide-btn')) return;
      beginReorder(e);
    });
    gutter.addEventListener('click', (e) => {
      if (!pressWasTouch) return;                     // mouse clicks are handled by the × below
      pressWasTouch = false;
      if ((e.target as HTMLElement).closest('.hide-btn') && toolsWereShowing) store.hide(t.id);
      else showTools();
    });
    hideBtn.addEventListener('click', () => { if (!pressWasTouch) store.hide(t.id); });
    gutter.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const me = e as MouseEvent;
      openTrackMenu(me.clientX, me.clientY);
    });
    return {
      el: row,
      label,
      yaxis: row.querySelector<HTMLCanvasElement>('.yaxis')!,
      canvas: row.querySelector<HTMLCanvasElement>('.data-canvas')!,
      fullLabel: '',
      labelLines: 0,
    };
  }

  function menuFor(t: Track): MenuItem[] {
    const s = store.styleOf(t);
    const set = (patch: Partial<TrackStyle>) => () => store.setOverride(t.id, patch);
    const items: MenuItem[] = [{ heading: displayName(t) }];
    if (t.kind === 'bed') {
      for (const m of ['dense', 'squish', 'pack', 'full'] as const) {
        items.push({ label: m[0].toUpperCase() + m.slice(1), checked: s.mode === m, onSelect: set({ mode: m }) });
      }
      items.push({ separator: true });
    }
    if (t.kind === 'signal') {
      const names: Record<TrackStyle['windowing'], string> = { max: 'Maximum', mean: 'Mean', min: 'Minimum', 'mean+whiskers': 'Mean with min–max range' };
      for (const w of ['max', 'mean', 'min', 'mean+whiskers'] as const) {
        items.push({ label: names[w], checked: s.windowing === w, onSelect: set({ windowing: w }) });
      }
      items.push({ separator: true });
      items.push({ label: 'Autoscale to view', checked: s.viewLimits === null, onSelect: set({ viewLimits: null }) });
      if (t.style.viewLimits) {
        const [a, b] = t.style.viewLimits;
        items.push({ label: `Fixed range ${a} to ${b}`, checked: s.viewLimits !== null, onSelect: set({ viewLimits: t.style.viewLimits }) });
      }
      items.push({ label: s.graphType === 'bar' ? 'Draw as points' : 'Draw as bars', onSelect: set({ graphType: s.graphType === 'bar' ? 'points' : 'bar' }) });
      items.push({ separator: true });
    }
    items.push({ label: 'About this track', onSelect: () => { location.hash = helpHash(`track-${t.id}`); } });
    items.push({ label: 'Hide track', onSelect: () => store.hide(t.id) });
    return items;
  }

  /** Make the DOM rows match the visible tracks, in order. */
  function syncRows(visible: Track[]) {
    const visibleIds = new Set(visible.map((t) => t.id));
    const keep = new Set(visible.map((t) => t.id));
    for (const [id, r] of rows) if (!keep.has(id)) { r.el.remove(); rows.delete(id); hits.delete(id); }
    visible.forEach((t, i) => {
      let r = rows.get(t.id);
      if (!r) rows.set(t.id, (r = makeRow(t)));
      const s = store.styleOf(t);
      const label = effectiveLabel(s, visibleIds);
      if (r.fullLabel !== label) { r.fullLabel = label; r.labelLines = 0; }
      r.label.style.color = resolveColor(s.color);
      r.label.classList.toggle('centered', s.centerLabel);
      r.el.style.marginTop = `${i === 0 ? 0 : s.marginTop}px`;
      r.el.dataset.kind = t.kind;
      if (stack.children[i] !== r.el) stack.insertBefore(r.el, stack.children[i] ?? null);
    });
    emptyNote.hidden = visible.length > 0;
  }

  // ------------------------------------------------------------------ render

  function render() {
    rafPending = false;
    const w = store.dataWidth;
    if (w <= 0) return;
    const { chrom, start, end } = store.view;
    const bp = (end - start) / w;
    const visible = store.visibleTracks();
    syncRows(visible);

    drawAxis(sizeCanvas(axisCanvas, w, AXIS_HEIGHT), chrom, start, end, w, AXIS_HEIGHT);

    // 1. Per-pixel summaries for signal tracks
    const sums = new Map<string, PixelSummary | null>();
    for (const t of visible) {
      if (t.kind !== 'signal') continue;
      const d = t.signal(chrom);
      sums.set(t.id, d ? signalSummary(d, start, bp, Math.ceil(w)) : null);
    }

    // 2. Y ranges: fixed, own autoscale, or shared autoscale group
    const ranges = new Map<string, [number, number]>();
    const groups = new Map<string, [number, number]>();
    for (const t of visible) {
      if (t.kind !== 'signal') continue;
      const s = store.styleOf(t);
      if (s.viewLimits) { ranges.set(t.id, s.viewLimits); continue; }
      const sum = sums.get(t.id);
      const raw: [number, number] = sum ? summaryRange(sum, s.windowing) : [0, 1];
      if (s.autoscaleGroup) {
        const g = groups.get(s.autoscaleGroup);
        groups.set(s.autoscaleGroup, g ? [Math.min(g[0], raw[0]), Math.max(g[1], raw[1])] : raw);
      } else {
        ranges.set(t.id, niceRange(raw));
      }
    }
    for (const t of visible) {
      const s = store.styleOf(t);
      if (t.kind === 'signal' && !s.viewLimits && s.autoscaleGroup) ranges.set(t.id, niceRange(groups.get(s.autoscaleGroup)!));
    }

    // 3. Draw
    for (const t of visible) {
      const r = rows.get(t.id)!;
      const s = store.styleOf(t);
      if (t.kind === 'signal') {
        const sum = sums.get(t.id) ?? null;
        const range = ranges.get(t.id)!;
        const ctx = sizeCanvas(r.canvas, w, s.height);
        if (sum) drawSignal(ctx, sum, s, range, w, s.height);
        drawYAxis(sizeCanvas(r.yaxis, YAXIS_W, s.height), s, range, YAXIS_W, s.height);
        setLabelLines(r, s.height);
        hits.set(t.id, { kind: 'signal', sum });
      } else if (t.kind === 'bed') {
        const d = t.bed(chrom);
        const feats = d ? bedInView(d, start, end) : [];
        const measure = r.canvas.getContext('2d')!;
        const lay = layoutBed(measure, feats, s, start, bp);
        const ctx = sizeCanvas(r.canvas, w, lay.height);
        drawBed(ctx, lay, s, start, bp, w);
        sizeCanvas(r.yaxis, YAXIS_W, lay.height);
        setLabelLines(r, lay.height);
        hits.set(t.id, { kind: 'bed', layout: lay });
      } else {
        const h = s.height;
        drawSequence(sizeCanvas(r.canvas, w, h), t.sequence(chrom), start, bp, w, h);
        sizeCanvas(r.yaxis, YAXIS_W, h);
        setLabelLines(r, h);
        hits.set(t.id, { kind: 'sequence' });
      }
    }
  }

  // ------------------------------------------------------------ hidden tray

  function renderTray() {
    const hidden = store.hiddenTracks();
    chips.replaceChildren();
    for (const t of hidden) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.title = 'Click to add at the bottom, or drag into place';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = resolveColor(store.styleOf(t).color);
      chip.append(sw, displayName(t));
      chip.addEventListener('pointerdown', (e) => {
        startDrag({
          event: e, label: displayName(t), color: resolveColor(store.styleOf(t).color),
          stack, indicator: dropIndicator, overlay,
          onClick: () => store.show(t.id),
          onDrop: (i) => store.show(t.id, i),
        });
      });
      // Keyboard users: Enter/Space on a focused chip adds it at the bottom.
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); store.show(t.id); }
      });
      chips.append(chip);
    }
    trayEmpty.hidden = hidden.length > 0;
    showAllBtn.hidden = hidden.length < 2;
  }
  showAllBtn.addEventListener('click', () => {
    store.showAll();
  });

  // --------------------------------------------------- pointer interactions

  /** Which row and local coordinates the pointer is over, if any. */
  function rowAt(e: MouseEvent): { t: Track; x: number; y: number } | null {
    // elementFromPoint, not e.target: pointer capture retargets events to .browser.
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const rowEl = under?.closest<HTMLElement>('.track-row');
    const data = under?.closest('.data');
    if (!rowEl || !data) return null;
    const rect = rowEl.querySelector('.data')!.getBoundingClientRect();
    return { t: trackById(rowEl.dataset.id!), x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const inData = (e: MouseEvent) => {
    const r = axisData.getBoundingClientRect();
    const b = stack.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= Math.max(b.bottom, r.bottom);
  };

  function showGuide(clientX: number) {
    const ob = overlay.getBoundingClientRect();
    const x = clientX - ob.left;
    guide.style.left = `${Math.round(x)}px`;
    const pos = Math.floor(posAtClientX(clientX));
    guideLabel.textContent = `${store.view.chrom}:${fmtInt(pos + 1)}`;
    guide.hidden = false;
  }

  function hoverInfo(e: MouseEvent): string | null {
    const hit = rowAt(e);
    if (!hit) return null;
    const { t, x, y } = hit;
    const h = hits.get(t.id);
    const s = store.styleOf(t);
    const head = `<div class="tt-head"><span class="swatch" style="background:${esc(resolveColor(s.color))}"></span>${esc(displayName(t))}</div>`;
    const pos = Math.floor(posAtClientX(e.clientX));
    if (h?.kind === 'signal') {
      const sum = h.sum;
      const px = Math.floor(x);
      if (!sum || Number.isNaN(sum.max[px])) return `${head}<div class="tt-muted">No data here</div>`;
      const n = (v: number) => (+v.toPrecision(4)).toString();
      if (sum.bpPerPx <= 1 || sum.min[px] === sum.max[px]) {
        return `${head}<div>${esc(store.view.chrom)}:${fmtInt(pos + 1)}</div><div class="tt-value">${n(sum.max[px])}</div>`;
      }
      const from = Math.floor(store.view.start + px * sum.bpPerPx);
      const to = Math.ceil(store.view.start + (px + 1) * sum.bpPerPx);
      return `${head}<div>${esc(formatPosition(store.view.chrom, from, to))}</div>
        <table class="tt-table"><tr><td>Max</td><td>${n(sum.max[px])}</td></tr><tr><td>Mean</td><td>${n(sum.mean[px])}</td></tr><tr><td>Min</td><td>${n(sum.min[px])}</td></tr></table>`;
    }
    if (h?.kind === 'bed') {
      const f = hitBed(h.layout, x, y);
      if (!f) return null;
      return `${head}${featureSummary(f)}`;
    }
    if (h?.kind === 'sequence') {
      const b = sequenceBaseAt(t.sequence(store.view.chrom), pos);
      if (!b) return null;
      return `${head}<div>${esc(store.view.chrom)}:${fmtInt(pos + 1)} <b style="color:${BASE_COLORS[b]}">${b}</b></div>`;
    }
    return null;
  }

  function featureSummary(f: BedFeature): string {
    const exons = f.blockSizes.length > 1 ? `<tr><td>Blocks</td><td>${f.blockSizes.length}</td></tr>` : '';
    const strand = f.strand !== '.' ? `<tr><td>Strand</td><td>${f.strand}</td></tr>` : '';
    return `${f.name ? `<div class="tt-name">${esc(f.name)}</div>` : ''}
      <div>${esc(formatPosition(f.chrom, f.start, f.end))}</div>
      <table class="tt-table"><tr><td>Length</td><td>${fmtInt(f.end - f.start)} bp</td></tr>${strand}<tr><td>Score</td><td>${f.score}</td></tr>${exons}</table>`;
  }

  // Selection drag (zoom to region) and click handling
  let sel: { x0: number; pointerId: number } | null = null;
  let clickTimer = 0;

  browser.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !inData(e) || (e.target as HTMLElement).closest('.gutter')) return;
    sel = { x0: e.clientX, pointerId: e.pointerId };
    browser.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  browser.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (sel) {
      const dx = e.clientX - sel.x0;
      if (Math.abs(dx) >= SELECT_MIN_PX) {
        const ob = overlay.getBoundingClientRect();
        const lo = Math.max(dataLeft(), Math.min(sel.x0, e.clientX));
        const hi = Math.min(axisData.getBoundingClientRect().right, Math.max(sel.x0, e.clientX));
        selection.style.left = `${lo - ob.left}px`;
        selection.style.width = `${hi - lo}px`;
        selectionLabel.textContent = formatSpan((hi - lo) * bpPerPx());
        selection.hidden = false;
        hideTooltip();
      }
      showGuide(e.clientX);
      return;
    }
    if (!inData(e) || document.body.classList.contains('is-dragging')) {
      guide.hidden = true;
      hideTooltip();
      return;
    }
    showGuide(e.clientX);
    const html = hoverInfo(e);
    if (html) showTooltip(e.clientX, e.clientY, html);
    else hideTooltip();
  });

  browser.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    if (!sel) return;
    const x0 = sel.x0;
    sel = null;
    selection.hidden = true;
    if (Math.abs(e.clientX - x0) >= SELECT_MIN_PX) {
      const a = posAtClientX(Math.min(x0, e.clientX));
      const b = posAtClientX(Math.max(x0, e.clientX));
      store.setView({ chrom: store.view.chrom, start: a, end: b });
      return;
    }
    clickAt(e);
  });

  function clickAt(e: PointerEvent) {
    // A plain click: open feature details unless a double-click follows.
    const hit = rowAt(e);
    clearTimeout(clickTimer);
    if (!hit) return;
    const h = hits.get(hit.t.id);
    if (h?.kind !== 'bed') return;
    const f = hitBed(h.layout, hit.x, hit.y);
    if (!f) return;
    const { clientX, clientY } = e;
    const t = hit.t;
    clickTimer = window.setTimeout(() => {
      const s = store.styleOf(t);
      openPopup(clientX, clientY,
        `<div class="tt-head"><span class="swatch" style="background:${esc(resolveColor(s.color))}"></span>${esc(displayName(t))}</div>${featureSummary(f)}`,
        [
          { label: 'Zoom to feature', run: () => { closePopup(); const pad = (f.end - f.start) * 0.1; store.setView({ chrom: f.chrom, start: f.start - pad, end: f.end + pad }); } },
          { label: 'Copy position', run: () => copy(formatPosition(f.chrom, f.start, f.end)) },
        ]);
    }, CLICK_DELAY);
  }

  browser.addEventListener('pointercancel', () => { sel = null; selection.hidden = true; });
  browser.addEventListener('pointerleave', () => { if (!sel) { guide.hidden = true; hideTooltip(); } });

  browser.addEventListener('dblclick', (e) => {
    if (!inData(e) || (e.target as HTMLElement).closest('.gutter')) return;
    clearTimeout(clickTimer);
    closePopup();
    store.zoomAt(3, posAtClientX(e.clientX));
  });

    // ---------------------------------------------------------- touch gestures
  // One finger: sideways drag = pan, hold = hover that follows the finger.
  // Two fingers: highlight between them, lift = zoom to it. Tap = click.
  // Normal mode lets the browser scroll vertically; Navigate mode (CSS touch-action: none) doesn't.
  const HOLD_MS = 450;
  const MOVE_TOLERANCE = 8;
  const touches = new Map<number, number>();            // pointerId → clientX
  let touchMode: 'none' | 'pending' | 'pan' | 'hover' | 'select' | 'done' = 'none';
  let holdTimer = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let panLastX = 0;

  const twoXs = () => [...touches.values()].slice(0, 2) as [number, number];
  const hideHover = () => { guide.hidden = true; hideTooltip(); };

  function hoverAt(e: PointerEvent) {
    showGuide(e.clientX);
    const html = hoverInfo(e);
    if (html) showTooltip(e.clientX, e.clientY, html, true);   // above the finger
    else hideTooltip();
  }

  function drawSelection(xA: number, xB: number) {
    const ob = overlay.getBoundingClientRect();
    const lo = Math.max(dataLeft(), Math.min(xA, xB));
    const hi = Math.min(axisData.getBoundingClientRect().right, Math.max(xA, xB));
    selection.style.left = `${lo - ob.left}px`;
    selection.style.width = `${Math.max(0, hi - lo)}px`;
    selectionLabel.textContent = formatSpan(Math.max(0, hi - lo) * bpPerPx());
    selection.hidden = false;
  }

  function zoomToSelection(xA: number, xB: number) {
    selection.hidden = true;
    const lo = Math.max(dataLeft(), Math.min(xA, xB));
    const hi = Math.min(axisData.getBoundingClientRect().right, Math.max(xA, xB));
    if (hi - lo < SELECT_MIN_PX) return;
    store.setView({ chrom: store.view.chrom, start: posAtClientX(lo), end: posAtClientX(hi) });
  }

  browser.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    // The first finger must start on the tracks; a second finger may land anywhere.
    if (touches.size === 0 && (!inData(e) || (e.target as HTMLElement).closest('.gutter'))) return;
    touches.set(e.pointerId, e.clientX);
    browser.setPointerCapture(e.pointerId);
    if (touches.size === 1) {
      touchMode = 'pending';
      touchStartX = panLastX = e.clientX;
      touchStartY = e.clientY;
      clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        if (touchMode === 'pending') { touchMode = 'hover'; hoverAt(e); }
      }, HOLD_MS);
    } else if (touches.size === 2) {
      clearTimeout(holdTimer);
      hideHover();
      touchMode = 'select';
      drawSelection(...twoXs());
    }
  });

  browser.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, e.clientX);
    if (touchMode === 'pending' && Math.hypot(e.clientX - touchStartX, e.clientY - touchStartY) > MOVE_TOLERANCE) {
      clearTimeout(holdTimer);
      touchMode = 'pan';
    }
    if (touchMode === 'pan') {
      store.pan(-(e.clientX - panLastX) * bpPerPx());
      panLastX = e.clientX;
    } else if (touchMode === 'hover') {
      hoverAt(e);
    } else if (touchMode === 'select' && touches.size >= 2) {
      drawSelection(...twoXs());
    }
  });

  const endTouch = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !touches.has(e.pointerId)) return;
    clearTimeout(holdTimer);
    if (touchMode === 'select') {
      if (e.type === 'pointerup' && touches.size === 2) zoomToSelection(...twoXs());
      else selection.hidden = true;
      touchMode = 'done';                       // ignore the other finger until it lifts
    } else if (touchMode === 'hover') {
      hideHover();
      touchMode = 'done';
    } else if (touchMode === 'pending' && e.type === 'pointerup') {
      clickAt(e);                               // quick tap
    }
    touches.delete(e.pointerId);
    if (touches.size === 0) touchMode = 'none';
  };
  browser.addEventListener('pointerup', endTouch);
  browser.addEventListener('pointercancel', endTouch);   // the browser took over (page scroll)

  // Stop the phone's own long-press menu on the tracks (track names keep the options menu).
  browser.addEventListener('contextmenu', (e) => {
    if (touchMode !== 'none' && !(e.target as HTMLElement).closest('.gutter')) e.preventDefault();
  });

  // While hovering or selecting, the finger may move in any direction without scrolling the page.
  browser.addEventListener('touchmove', (e) => {
    if (touchMode === 'hover' || touchMode === 'select') e.preventDefault();
  }, { passive: false });

  // Wheel: horizontal = pan, alt+vertical = zoom at pointer, plain vertical = page scroll.
  browser.addEventListener('wheel', (e) => {
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.altKey) {
      e.preventDefault();
      const anchor = inData(e) ? posAtClientX(e.clientX) : (store.view.start + store.view.end) / 2;
      const delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
      store.zoomAt(Math.exp(delta * 0.0025), anchor);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault(); // also stops the browser's swipe-to-go-back
      store.pan(dx * bpPerPx());
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!active || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const span = store.view.end - store.view.start;
    if (e.key === 'ArrowLeft') { store.pan(-span * 0.1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { store.pan(span * 0.1); e.preventDefault(); }
  });

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => window.prompt('Copy this position:', text));
    closePopup();
  }

  // ----------------------------------------------------------- subscriptions

  const ro = new ResizeObserver(() => {
    const w = Math.floor(axisData.clientWidth);
    if (w > 0 && w !== store.dataWidth) {
      for (const r of rows.values()) r.labelLines = 0;   // widths changed: refit every label
      store.dataWidth = w;
      store.setView(store.view); // re-clamp zoom limits for the new width
      syncToolbar();
      scheduleRender();
    }
  });
  ro.observe(axisData);

  // Moving the window to a screen with a different pixel density: redraw sharply and refit labels.
  const watchPixelRatio = () => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => {
      for (const r of rows.values()) r.labelLines = 0;
      scheduleRender();
      watchPixelRatio();          // re-arm for the new density
    }, { once: true });
  };
  watchPixelRatio();

  store.subscribe((what) => {
    if (what === 'view') { closePopup(); syncToolbar(); }
    if (what === 'layout') renderTray();
    scheduleRender();
  });

  syncToolbar();
  renderTray();

  return {
    el,
    activate() {
      active = true;
      store.dataWidth = Math.floor(axisData.clientWidth) || store.dataWidth;
      store.setView(store.view);
      syncToolbar();
      scheduleRender();
    },
    deactivate() {
      active = false;
      guide.hidden = true;
      hideTooltip();
      closePopup();
    },
  };
}

