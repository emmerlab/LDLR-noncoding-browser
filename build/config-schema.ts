/**
 * build/config-schema.ts
 * ----------------------------------------------------------------------------
 * The shape of tracks.config.ts, the `defineConfig` helper it imports, default
 * values, and validation with friendly "did you mean" errors.
 *
 * Everything in the config is optional. A missing config file is fine.
 */
import type { BedMode, GraphType, Windowing } from '../shared/types';

/** Per-track settings. Every field is optional and overrides the file's `track` line. */
export interface TrackOptions {
  /** Name shown left of the track. Use "" for no label. */
  label?: string;
  /** Main color, any CSS color: "#7b6fb5", "rgb(10,120,80)", "teal". */
  color?: string;
  /** Color for negative values in signal tracks. */
  altColor?: string;
  /** Height of a signal track in px (default 50). */
  height?: number;
  /** Space above the track in px (default 6). Use 0–2 to tuck peaks under a signal. */
  marginTop?: number;
  /** Rotated y-axis title. Sub/superscript: "log_{2}FC", "-log_{10} p", "x^{2}". */
  yLabel?: string;
  /** Fixed y range. Omit to autoscale to whatever is on screen. */
  viewLimits?: [number, number];
  /** Tracks sharing a group name are autoscaled to one common range. */
  autoscaleGroup?: string;
  /** How many bases are summarised into one pixel: max (default), mean, min, mean+whiskers. */
  windowing?: Windowing;
  /** Signal drawing: bar (default) or points. */
  graphType?: GraphType;
  /** BED display mode: dense, squish, pack (default), full. */
  mode?: BedMode;
  /** Start hidden; the track waits in the hidden-tracks tray. */
  hidden?: boolean;
  /** Color BED features by their itemRgb column. */
  itemRgb?: boolean;
  /** Thin line through the middle of a dense BED row. */
  centerLine?: boolean;
  /** Show feature names in pack/full mode (default true). */
  featureLabels?: boolean;
  /** Center the track name vertically on the track instead of aligning it to the top. */
  centerLabel?: boolean;
  /**
   * Track(s) this one belongs under (file names or ids). When re-added from the hidden
   * tray it goes below the lowest visible of them; dragging ignores this.
   */
  after?: string | string[];
  /** Label to use while every track in `after` is hidden. */
  missingParentName?: string;
}

export interface BrowserConfig {
  /** Shown in the header and the browser tab. */
  title?: string;
  /** Smaller text next to the title. */
  subtitle?: string;
  /** Where the viewer opens, 1-based like UCSC: "chr7:55,000,001-55,300,000". */
  defaultPosition?: string;
  genome?: {
    /** Path to chrom.sizes, relative to the project root. Default "genome/chrom.sizes". */
    chromSizes?: string;
    /**
     * Path to a FASTA file, or false to disable the sequence track.
     * Default: the first *.fa / *.fasta (optionally .gz) found in genome/.
     */
    fasta?: string | false;
  };
  /** Built-in reference sequence track (only exists when a FASTA is present). */
  sequenceTrack?: { label?: string; hidden?: boolean };
  /** Build fails above this total size for bundled data (MB). Default 200. Warns above 50. */
  maxDataMB?: number;
  /** Keys are track file names ("atac.bedGraph") or ids (file name without extension). */
  tracks?: Record<string, TrackOptions>;
  /** Folder scanned for track files, relative to the project root. Default "tracks". */
  tracksDir?: string;
  /** Visit counting (see src/analytics.ts). Omit to count nothing. */
  analytics?: {
    /** GoatCounter count endpoint: "https://<code>.goatcounter.com/count". */
    goatcounter: string;
  };
}

/** Identity function that gives tracks.config.ts autocomplete and type checking. */
export function defineConfig(config: BrowserConfig): BrowserConfig {
  return config;
}

/** Palette used for tracks that don't set a color. */
export const DEFAULT_PALETTE = [
  '#6f63b0', '#d6337a', '#1f9e78', '#e07b18', '#2c6db5', '#5b5f66', '#9a6a2f', '#2a8d9c',
];

const TRACK_KEYS: (keyof TrackOptions)[] = [
  'label', 'color', 'altColor', 'height', 'marginTop', 'yLabel', 'viewLimits', 'autoscaleGroup',
  'windowing', 'graphType', 'mode', 'hidden', 'itemRgb', 'centerLine', 'featureLabels', 'centerLabel',
  'after', 'missingParentName',
];
const TOP_KEYS: (keyof BrowserConfig)[] = [
  'title', 'subtitle', 'defaultPosition', 'genome', 'sequenceTrack', 'maxDataMB', 'tracks', 'tracksDir',
  'analytics',
];
const GOATCOUNTER_RE = /^https:\/\/[^/\s]+\/count$/;
const ENUMS: Partial<Record<keyof TrackOptions, readonly string[]>> = {
  windowing: ['max', 'mean', 'min', 'mean+whiskers'],
  graphType: ['bar', 'points'],
  mode: ['dense', 'squish', 'pack', 'full'],
};

/** Levenshtein distance, for "did you mean" suggestions. */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

export function suggest(word: string, options: readonly string[]): string {
  let best = '';
  let bestD = Infinity;
  for (const o of options) {
    const d = editDistance(word.toLowerCase(), o.toLowerCase());
    if (d < bestD) { bestD = d; best = o; }
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? ` Did you mean "${best}"?` : '';
}

/** Throws a readable Error listing every problem found. */
export function validateConfig(config: BrowserConfig): void {
  const errors: string[] = [];
  for (const key of Object.keys(config)) {
    if (!TOP_KEYS.includes(key as keyof BrowserConfig)) {
      errors.push(`Unknown setting "${key}".${suggest(key, TOP_KEYS)}`);
    }
  }
  for (const [name, opts] of Object.entries(config.tracks ?? {})) {
    for (const [key, value] of Object.entries(opts)) {
      const where = `tracks["${name}"].${key}`;
      if (!TRACK_KEYS.includes(key as keyof TrackOptions)) {
        errors.push(`Unknown track setting ${where}.${suggest(key, TRACK_KEYS)}`);
        continue;
      }
      const allowed = ENUMS[key as keyof TrackOptions];
      if (allowed && !allowed.includes(value as string)) {
        errors.push(`${where} is "${value}", expected one of: ${allowed.join(', ')}.`);
      }
      if ((key === 'height' || key === 'marginTop') && (typeof value !== 'number' || value < 0)) {
        errors.push(`${where} must be a number ≥ 0.`);
      }
      if (key === 'viewLimits' && !(Array.isArray(value) && value.length === 2 && value[0] < value[1])) {
        errors.push(`${where} must be [min, max] with min < max.`);
      }
      if (key === 'after' && !(typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string')))) {
        errors.push(`${where} must be a track name or a list of track names.`);
      }
    }
  }
  if (config.analytics && !GOATCOUNTER_RE.test(config.analytics.goatcounter ?? '')) {
    errors.push('analytics.goatcounter must look like "https://<code>.goatcounter.com/count".');
  }
  if (errors.length) {
    throw new Error(`tracks.config.ts has ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  }
}
