/**
 * tests/core.test.ts: coordinates, zoom pyramid, per-pixel summaries, row
 * packing, router, help slugs, config validation.
 */
import { describe, expect, it } from 'vitest';
import { formatPosition, formatSpan, niceCeil, parsePosition } from '../src/core/coords';
import { packRows } from '../src/core/packing';
import { parseHash } from '../src/router';
import { buildLevel } from '../build/pyramid';
import { slugify } from '../build/help';
import { validateConfig } from '../build/config-schema';
import { signalSummary } from '../src/data/query';

const chroms = [{ name: 'chr7', size: 159_345_973 }, { name: 'chrX', size: 1000 }];

describe('coordinates', () => {
  it('displays 0-based half-open as 1-based inclusive', () => {
    expect(formatPosition('chr7', 0, 100)).toBe('chr7:1-100');
  });
  it('parses ranges, single bases and chromosome names', () => {
    expect(parsePosition('chr7:1-100', chroms)).toEqual({ chrom: 'chr7', start: 0, end: 100 });
    expect(parsePosition(' chr7:55,000,001 – 55,300,000 ', chroms)).toEqual({ chrom: 'chr7', start: 55_000_000, end: 55_300_000 });
    expect(parsePosition('x', chroms)).toEqual({ chrom: 'chrX', start: 0, end: 1000 });
    expect(parsePosition('chr7:1000', chroms)).toEqual({ chrom: 'chr7', start: 949, end: 1049 });
    expect(parsePosition('chr99:1-2', chroms)).toBeNull();
  });
  it('round-trips format → parse', () => {
    const s = formatPosition('chr7', 12_345, 67_890);
    expect(parsePosition(s, chroms)).toEqual({ chrom: 'chr7', start: 12_345, end: 67_890 });
  });
  it('makes readable spans and axis maxima', () => {
    expect(formatSpan(1500)).toBe('1.5 kb');
    expect(formatSpan(2_000_000)).toBe('2 Mb');
    expect(niceCeil(8.3)).toBe(9);
    expect(niceCeil(0.34)).toBeCloseTo(0.4);
  });
});

describe('zoom pyramid', () => {
  it('summarises min/max and coverage-weighted mean per bin', () => {
    const lvl = buildLevel({ starts: [0, 16, 40], ends: [16, 32, 48], values: [2, 4, 10] }, 32);
    expect(lvl.idx).toEqual([0, 1]);
    expect(lvl.min).toEqual([2, 10]);
    expect(lvl.max).toEqual([4, 10]);
    expect(lvl.mean[0]).toBeCloseTo(3);
  });
});

describe('signalSummary', () => {
  const raw = {
    starts: Uint32Array.from([0, 10]), ends: Uint32Array.from([10, 20]), values: Float32Array.from([1, 5]),
    maxSpan: 10, levels: [],
  };
  it('gives one value per pixel when zoomed in', () => {
    const s = signalSummary(raw, 0, 1, 20);
    expect(s.max[3]).toBe(1);
    expect(s.max[15]).toBe(5);
  });
  it('combines values when several bases share a pixel', () => {
    const s = signalSummary(raw, 0, 20, 1);
    expect(s.max[0]).toBe(5);
    expect(s.min[0]).toBe(1);
    expect(s.mean[0]).toBeCloseTo(3);
  });
  it('leaves pixels without data empty (NaN), not zero', () => {
    const s = signalSummary(raw, 100, 1, 5);
    expect(Number.isNaN(s.max[0])).toBe(true);
  });
});

describe('packRows', () => {
  it('puts overlapping items on separate rows and reuses free rows', () => {
    expect(packRows([{ x0: 0, x1: 10 }, { x0: 5, x1: 15 }, { x0: 20, x1: 30 }], 2, 10)).toEqual([0, 1, 0]);
  });
  it('caps rows', () => {
    expect(packRows([{ x0: 0, x1: 10 }, { x0: 0, x1: 10 }, { x0: 0, x1: 10 }], 2, 2)).toEqual([0, 1, 1]);
  });
});

describe('router', () => {
  it('parses viewer and help hashes', () => {
    expect(parseHash('')).toEqual({ page: 'viewer', pos: null });
    expect(parseHash('#/viewer?pos=chr7:1-100')).toEqual({ page: 'viewer', pos: 'chr7:1-100' });
    expect(parseHash('#/help')).toEqual({ page: 'help', anchor: null });
    expect(parseHash('#/help/track-atac')).toEqual({ page: 'help', anchor: 'track-atac' });
  });
});

describe('help and config', () => {
  it('slugifies headings', () => {
    expect(slugify('Getting around!')).toBe('getting-around');
  });
  it('rejects typos with a suggestion', () => {
    expect(() => validateConfig({ tracks: { 'a.bed': { colr: 'red' } as never } })).toThrow(/Did you mean "color"/);
    expect(() => validateConfig({ tracks: { 'a.bed': { mode: 'tiny' as never } } })).toThrow(/dense, squish, pack, full/);
    expect(() => validateConfig({ title: 'ok', tracks: { 'a.wig': { viewLimits: [0, 10] } } })).not.toThrow();
    expect(() => validateConfig({ analytics: { goatcounter: 'https://x.goatcounter.com/count' } })).not.toThrow();
    expect(() => validateConfig({ analytics: { goatcounter: 'x.goatcounter.com' } })).toThrow(/analytics\.goatcounter/);
  });
});
