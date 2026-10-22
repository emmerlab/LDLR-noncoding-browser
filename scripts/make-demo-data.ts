/**
 * scripts/make-demo-data.ts
 * ----------------------------------------------------------------------------
 * Writes SYNTHETIC demo files for trying the browser without real data.
 * Nothing here is real biology. Run with:
 *
 *   npm run demo-data
 *
 * Output (all on hg38 chr7:55,000,001-55,300,000), in tracks/test_tracks/:
 *   demo_genes.bed           BED12 gene models (made-up genes)
 *   demo_sprn.wig            fixedStep signal        + demo_sprn_hits.bed
 *   demo_spri.bedGraph       bedGraph signal         + demo_spri_hits.bed
 *   demo_spra.wig            variableStep signal     + demo_spra_hits.bed
 *   demo_atac.bedGraph       sparse log2FC peaks     + demo_atac_peaks.bed
 *   demo_h3k27ac.wig         broad domains with negatives + demo_h3k27ac_domains.bed
 *   demo_cons.bed            many small elements (dense row)
 *   demo_ccre.bed            BED9 with itemRgb colors (dense row)
 * and genome/demo_sequence.fa, random sequence for base-level zoom.
 *
 * To view them, point `tracksDir` and `genome.fasta` in tracks.config.ts at
 * these files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_TRACKS = 'tracks/test_tracks';
const CHROM = 'chr7';
const START = 55_000_000; // 0-based
const END = 55_300_000;

// Deterministic random numbers so the demo looks the same every time.
let seed = 20261008;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = (x: number, mu: number, sd: number) => Math.exp(-((x - mu) ** 2) / (2 * sd * sd));

const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
  console.log(`wrote ${rel} (${(text.length / 1024).toFixed(0)} KB)`);
};

// ---------------------------------------------------------------- genes ----
interface Gene { name: string; start: number; end: number; strand: '+' | '-'; exons: [number, number][]; cds: [number, number] }
function makeGene(name: string, start: number, end: number, strand: '+' | '-', nExons: number): Gene {
  const exons: [number, number][] = [];
  const len = end - start;
  for (let i = 0; i < nExons; i++) {
    const s = i === 0 ? start : start + Math.floor((i / nExons) * len + rand() * (len / nExons) * 0.5);
    const size = i === 0 || i === nExons - 1 ? 600 + Math.floor(rand() * 1800) : 90 + Math.floor(rand() * 260);
    const e = Math.min(end, i === nExons - 1 ? end : s + size);
    if (!exons.length || s > exons[exons.length - 1][1] + 50) exons.push([s, e]);
  }
  exons[exons.length - 1][1] = end;
  const cds: [number, number] = [exons[0][0] + Math.floor((exons[0][1] - exons[0][0]) * 0.6), exons[exons.length - 1][0] + 120];
  return { name, start, end, strand, exons, cds };
}
const genes = [
  makeGene('DEMO1', 55_004_000, 55_052_000, '+', 9),
  makeGene('DEMO2', 55_120_000, 55_236_000, '+', 26),
  makeGene('DEMO3', 55_248_000, 55_268_000, '-', 5),
  makeGene('DEMO4', 55_276_000, 55_296_000, '+', 6),
];
write(`${DEMO_TRACKS}/demo_genes.bed`,
  'track name="Genes" description="Synthetic gene models for the demo"\n' +
  genes.map((g) => [
    CHROM, g.start, g.end, g.name, 0, g.strand, g.cds[0], g.cds[1], '0', g.exons.length,
    g.exons.map(([s, e]) => e - s).join(',') + ',', g.exons.map(([s]) => s - g.start).join(',') + ',',
  ].join('\t')).join('\n') + '\n');

// ---------------------------------------------------------- signal model ----
interface Peak { at: number; height: number; width: number }
function peaksIn(from: number, to: number, n: number, maxH: number, width: [number, number]): Peak[] {
  return Array.from({ length: n }, () => ({
    at: from + rand() * (to - from),
    height: maxH * (0.15 + 0.85 * rand() ** 2.2),
    width: width[0] + rand() * (width[1] - width[0]),
  }));
}
function sample(peaks: Peak[], pos: number, noise: number, cap = Infinity): number {
  let v = 0;
  for (const p of peaks) if (Math.abs(pos - p.at) < p.width * 4) v += p.height * gauss(pos, p.at, p.width);
  return Math.min(cap, v + noise * rand() ** 3);
}
/** Runs above `threshold` become BED6 "hits". */
function hits(values: [number, number, number][], threshold: number, prefix: string): string {
  const out: string[] = [];
  let run: [number, number, number] | null = null;
  for (const [s, e, v] of values) {
    if (v >= threshold) {
      if (run && s <= run[1]) { run[1] = e; run[2] = Math.max(run[2], v); }
      else { if (run) out.push(fmtHit(run, prefix, out.length)); run = [s, e, v]; }
    }
  }
  if (run) out.push(fmtHit(run, prefix, out.length));
  return out.join('\n') + '\n';
}
const fmtHit = (r: [number, number, number], prefix: string, i: number) =>
  [CHROM, r[0], r[1], `${prefix}_${i + 1}`, Math.min(1000, Math.round(r[2] * 100)), '.'].join('\t');

// SPRn: fixedStep, strong cluster over DEMO2
{
  const step = 50;
  const peaks = [...peaksIn(55_118_000, 55_240_000, 140, 8.6, [40, 160]), ...peaksIn(START, END, 40, 2.5, [40, 120])];
  const vals: [number, number, number][] = [];
  let body = `track type=wiggle_0 name="SPRn" description="Synthetic screen signal, -log10 p"\nfixedStep chrom=${CHROM} start=${START + 1} step=${step} span=${step}\n`;
  for (let p = START; p < END; p += step) {
    const v = +sample(peaks, p, 0.9, 8.9).toFixed(3);
    body += `${v}\n`;
    vals.push([p, p + step, v]);
  }
  write(`${DEMO_TRACKS}/demo_sprn.wig`, body);
  write(`${DEMO_TRACKS}/demo_sprn_hits.bed`, hits(vals, 3, 'sprn'));
}

// SPRi: bedGraph, cluster over the first half of DEMO2
{
  const step = 50;
  const peaks = [...peaksIn(55_118_000, 55_200_000, 110, 8.8, [40, 180]), ...peaksIn(START, END, 30, 1.8, [40, 120])];
  const vals: [number, number, number][] = [];
  const lines: string[] = ['track type=bedGraph name="SPRi"'];
  for (let p = START; p < END; p += step) {
    const v = +sample(peaks, p, 0.6, 8.9).toFixed(3);
    if (v > 0.02) { lines.push(`${CHROM}\t${p}\t${p + step}\t${v}`); vals.push([p, p + step, v]); }
  }
  write(`${DEMO_TRACKS}/demo_spri.bedGraph`, lines.join('\n') + '\n');
  write(`${DEMO_TRACKS}/demo_spri_hits.bed`, hits(vals, 3, 'spri'));
}

// SPRa: variableStep, cluster upstream (left half)
{
  const step = 50;
  const peaks = [...peaksIn(55_030_000, 55_120_000, 90, 7.5, [40, 200]), ...peaksIn(START, END, 25, 1.5, [40, 120])];
  const vals: [number, number, number][] = [];
  let body = `track type=wiggle_0 name="SPRa"\nvariableStep chrom=${CHROM} span=${step}\n`;
  for (let p = START; p < END; p += step) {
    const v = +sample(peaks, p, 0.7, 8.9).toFixed(3);
    if (v > 0.02) { body += `${p + 1}\t${v}\n`; vals.push([p, p + step, v]); }
  }
  write(`${DEMO_TRACKS}/demo_spra.wig`, body);
  write(`${DEMO_TRACKS}/demo_spra_hits.bed`, hits(vals, 2.5, 'spra'));
}

// ATAC: sparse peaks only (bedGraph with gaps), log2FC
{
  const step = 25;
  const centers = Array.from({ length: 34 }, () => START + 3000 + rand() * (END - START - 6000)).sort((a, b) => a - b);
  const peaks = centers.map((c) => ({ at: c, height: 1 + rand() * 3, width: 120 + rand() * 260 }));
  const vals: [number, number, number][] = [];
  const lines: string[] = ['track type=bedGraph name="ATAC"'];
  for (let p = START; p < END; p += step) {
    const v = sample(peaks, p, 0, 4.6);
    if (v > 0.15) { const r = +v.toFixed(3); lines.push(`${CHROM}\t${p}\t${p + step}\t${r}`); vals.push([p, p + step, r]); }
  }
  write(`${DEMO_TRACKS}/demo_atac.bedGraph`, lines.join('\n') + '\n');
  write(`${DEMO_TRACKS}/demo_atac_peaks.bed`, hits(vals, 0.8, 'atac'));
}

// H3K27ac: broad domains, small negative dips (shows altColor)
{
  const step = 100;
  const domains = [
    ...peaksIn(55_116_000, 55_240_000, 60, 1.6, [800, 2600]),
    ...peaksIn(55_000_000, 55_060_000, 10, 1.1, [600, 1800]),
    ...peaksIn(55_250_000, 55_300_000, 18, 1.3, [700, 2000]),
  ];
  const vals: [number, number, number][] = [];
  let body = `track type=wiggle_0 name="H3K27ac"\nfixedStep chrom=${CHROM} start=${START + 1} step=${step} span=${step}\n`;
  for (let p = START; p < END; p += step) {
    const v = +(sample(domains, p, 0.25) * (0.75 + 0.5 * rand()) - 0.12).toFixed(3);
    body += `${v}\n`;
    vals.push([p, p + step, v]);
  }
  write(`${DEMO_TRACKS}/demo_h3k27ac.wig`, body);
  write(`${DEMO_TRACKS}/demo_h3k27ac_domains.bed`, hits(vals, 0.9, 'k27ac'));
}

// Conservation-like small elements (dense)
{
  const lines: string[] = ['track name="Conserved"'];
  let p = START + Math.floor(rand() * 2000);
  let i = 0;
  while (p < END - 200) {
    const inGene = genes.some((g) => p > g.start && p < g.end);
    const len = 20 + Math.floor(rand() * 180);
    lines.push(`${CHROM}\t${p}\t${p + len}\tcons_${++i}`);
    p += len + Math.floor(rand() * (inGene ? 1400 : 4200));
  }
  write(`${DEMO_TRACKS}/demo_cons.bed`, lines.join('\n') + '\n');
}

// cCRE-like elements with itemRgb (dense, colored)
{
  const kinds = [['PLS', '255,0,0'], ['pELS', '255,167,0'], ['dELS', '255,205,0'], ['CTCF', '0,176,240']] as const;
  const lines: string[] = ['track name="cCREs" itemRgb="On"'];
  let p = START + Math.floor(rand() * 1500);
  let i = 0;
  while (p < END - 400) {
    const [kind, rgb] = kinds[Math.floor(rand() ** 1.6 * kinds.length)];
    const len = 150 + Math.floor(rand() * 200);
    lines.push([CHROM, p, p + len, `${kind}_${++i}`, 0, '.', p, p + len, rgb].join('\t'));
    p += len + Math.floor(rand() * 2600);
  }
  write(`${DEMO_TRACKS}/demo_ccre.bed`, lines.join('\n') + '\n');
}

// ------------------------------------------------------------- sequence ----
{
  const bases = 'ACGT';
  let seq = '';
  for (let i = 0; i < END - START; i++) {
    if (i >= 150_000 && i < 150_120) { seq += 'N'; continue; }
    const r = rand();
    seq += r < 0.29 ? 'A' : r < 0.5 ? 'C' : r < 0.71 ? 'G' : bases[3];
  }
  const lines = [`>${CHROM}:${START + 1}-${END} synthetic demo sequence, not real hg38`];
  for (let i = 0; i < seq.length; i += 60) lines.push(seq.slice(i, i + 60));
  write('genome/demo_sequence.fa', lines.join('\n') + '\n');
}
