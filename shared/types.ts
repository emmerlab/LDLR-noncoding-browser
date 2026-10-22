/**
 * shared/types.ts
 * ----------------------------------------------------------------------------
 * Types shared by the build pipeline (build/, runs in Node) and the browser
 * runtime (src/, runs in the page). The build produces a `Bundle` object and
 * inlines it into the page; the runtime decodes it.
 *
 * Coordinate convention everywhere in code: 0-based, half-open [start, end),
 * exactly like BED. Only the UI shows 1-based coordinates (see src/core/coords.ts).
 */

export type BedMode = 'dense' | 'squish' | 'pack' | 'full';
export type Windowing = 'max' | 'mean' | 'min' | 'mean+whiskers';
export type GraphType = 'bar' | 'points';
export type TrackFormat = 'wig' | 'bedGraph' | 'bed';
export type TrackKind = 'signal' | 'bed' | 'sequence';

/** Fully resolved style for one track (defaults < track line < tracks.config.ts). */
export interface TrackStyle {
  /** Name shown left of the track. Empty string = no visible label. */
  label: string;
  /** Main color (CSS color). */
  color: string;
  /** Color for negative signal values. */
  altColor: string;
  /** Height in px of a signal track. BED tracks size themselves from their rows. */
  height: number;
  /** Space above the track in px. Set to 0–2 to tuck a peaks track under its signal. */
  marginTop: number;
  /** Rotated y-axis title. Supports sub/superscript: "log_{2}FC", "-log_{10} p". */
  yLabel: string;
  /** Fixed y range [min, max]. null = autoscale to the visible region. */
  viewLimits: [number, number] | null;
  /** Tracks with the same group name share one autoscaled y range. */
  autoscaleGroup: string | null;
  windowing: Windowing;
  graphType: GraphType;
  mode: BedMode;
  /** Start hidden (track appears in the hidden-tracks tray). */
  hidden: boolean;
  /** Use per-feature itemRgb colors from BED column 9. */
  itemRgb: boolean;
  /** Draw a thin line through the middle of a dense BED row. */
  centerLine: boolean;
  /** Draw feature names in pack/full mode. */
  featureLabels: boolean;
  /** Free-text description (from the `track` line's description=). */
  description: string;
  /** Center the track name vertically (default: top-aligned). */
  centerLabel: boolean;
  /** Ids of the tracks this one is placed under when re-added (resolved at build time). */
  after: string[];
  /** While all parents are hidden, show the first parent's name as the label. */
  missingParentName: string;
}

/** One zoom level of the signal pyramid. Only bins that contain data are stored. */
export interface EncodedLevel {
  binSize: number;
  n: number;
  /** base64 Uint32Array: bin index; bin covers [idx*binSize, (idx+1)*binSize). */
  idx: string;
  /** base64 Float32Array per bin. */
  min: string;
  max: string;
  mean: string;
}

export interface EncodedSignalChrom {
  n: number;
  /** Longest interval on this chromosome (used to bound binary searches). */
  maxSpan: number;
  /** base64 Uint32Array / Uint32Array / Float32Array, sorted by start. */
  starts: string;
  ends: string;
  values: string;
  /** Coarser summaries, ascending binSize. May be empty for small tracks. */
  levels: EncodedLevel[];
}

/** Column-oriented BED features for one chromosome, sorted by start. */
export interface EncodedBedChrom {
  n: number;
  maxSpan: number;
  starts: number[];
  ends: number[];
  names: string[];
  scores: number[];
  /** One char per feature: '+', '-' or '.'. */
  strands: string;
  thickStarts: number[];
  thickEnds: number[];
  /** "r,g,b" or '' when absent. */
  rgb: string[];
  /** Per feature; empty array when the feature has no blocks (BED < 12). */
  blockSizes: number[][];
  blockStarts: number[][];
}

export interface TrackStats {
  chroms: string[];
  /** Data points (signal) or features (BED). */
  count: number;
  valueMin?: number;
  valueMax?: number;
  /** Number of BED columns detected. */
  bedFields?: number;
  fileBytes: number;
}

export interface TrackBundle {
  id: string;
  file: string;
  format: TrackFormat;
  kind: 'signal' | 'bed';
  style: TrackStyle;
  stats: TrackStats;
  signal?: Record<string, EncodedSignalChrom>;
  bed?: Record<string, EncodedBedChrom>;
}

export interface SequenceRecord {
  chrom: string;
  /** 0-based genome position of the first base. */
  offset: number;
  length: number;
  /** base64 2-bit packed bases, 4 per byte, A=0 C=1 G=2 T=3, high bits first. */
  packed: string;
  /** Flat [start, end, start, end, ...] runs of N, relative to offset. */
  nRuns: number[];
}

export interface SequenceBundle {
  file: string;
  label: string;
  hidden: boolean;
  records: SequenceRecord[];
}

export interface TocEntry {
  id: string;
  text: string;
  children: TocEntry[];
}

export interface HelpBundle {
  /** Prebuilt HTML of the whole help page. */
  html: string;
  toc: TocEntry[];
}

export interface ChromInfo {
  name: string;
  size: number;
}

/** Everything the page needs, produced by build/plugin.ts. */
export interface Bundle {
  buildHash: string;
  title: string;
  subtitle: string;
  /** 1-based display string, e.g. "chr7:55,000,001-55,300,000". */
  defaultPosition: string;
  chroms: ChromInfo[];
  tracks: TrackBundle[];
  sequence: SequenceBundle | null;
  help: HelpBundle;
  /** GoatCounter count endpoint, or null to count nothing (see src/analytics.ts). */
  goatcounter: string | null;
}

/** Id reserved for the built-in reference sequence track. */
export const SEQUENCE_TRACK_ID = 'sequence';
