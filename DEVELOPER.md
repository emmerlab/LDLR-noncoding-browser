# Single-file genome browser

A genome browser that runs entirely in the web browser and builds into **one HTML file**. Your WIG, bedGraph and BED tracks, an optional reference sequence, and a Markdown help page are all packed inside that file. No server, no internet connection: double-click `dist/index.html` and it works, or email it, or put it on any static host.

The look is a clean, publication-figure style: white background, colored track names, slim y-axes, and peaks drawn directly under their signal.

This repository is configured for the *LDLR* locus: the tracks are in `tracks/new_data/` (set by `tracksDir` in `tracks.config.ts`), the reference sequence is `genome/hg38_ldlr_region.fa`, and the help text is in `help/`. The data-preparation notebooks are in `py_data_manip/` (see its own `DEVELOPER.md`).

```
tracks/*.wig  tracks/*.bedGraph  tracks/*.bed   ─┐
genome/chrom.sizes   genome/*.fa (optional)      ├─►  npm run build  ─►  dist/index.html
help/index.md   help/tracks/*.md   images        │
tracks.config.ts (optional)                     ─┘
```

---

## Contents

- [Single-file genome browser](#single-file-genome-browser)
  - [Contents](#contents)
  - [1. Quick start](#1-quick-start)
  - [2. Adding your own data](#2-adding-your-own-data)
    - [Track ids](#track-ids)
    - [Pairing a signal with its peaks](#pairing-a-signal-with-its-peaks)
  - [3. `tracks.config.ts` reference](#3-tracksconfigts-reference)
    - [Top-level settings](#top-level-settings)
    - [Per-track settings](#per-track-settings)
  - [4. Genome files](#4-genome-files)
  - [5. Help pages and images](#5-help-pages-and-images)
    - [Images](#images)
  - [6. Using the viewer](#6-using-the-viewer)
  - [7. What each file does](#7-what-each-file-does)
  - [8. How it works](#8-how-it-works)
    - [Build time (`build/`)](#build-time-build)
    - [Run time (`src/`)](#run-time-src)
    - [Coordinates](#coordinates)
  - [9. Changing the look](#9-changing-the-look)
  - [10. Large data](#10-large-data)
  - [11. Troubleshooting](#11-troubleshooting)
  - [12. Unit Testing](#12-unit-testing)
  - [13. Analytics](#13-analytics)
  - [14. Versions and deployment](#14-versions-and-deployment)

---

## 1. Quick start

Requirements: [Node.js](https://nodejs.org) 18 or newer. On Windows, [nvm-windows](https://github.com/coreybutler/nvm-windows) is an easy way to install it:

```powershell
nvm install 24
nvm use 24
```

Then:

```bash
npm install          # once
npm run build        # → dist/index.html
```

Open `dist/index.html` in any modern browser. Synthetic demo files (`demo_*`, made by `npm run demo-data`) are in `tracks/test_tracks/` and `genome/demo_sequence.fa`; they are not part of the LDLR build.

| Command | What it does |
| --- | --- |
| `npm run dev` | Live development server at http://localhost:5173. Edits to code, data, help or config reload the page automatically. |
| `npm run build` | Builds the single file `dist/index.html`. Prints a summary of every track and any warnings, and saves a copy in `build-history/` (see [Versions and deployment](#14-versions-and-deployment)). |
| `npm run preview` | Serves the built `dist/` folder locally to check it. |
| `npm test` | Runs the unit tests (parsers, coordinates, zoom math, packing, router, config validation, track layout, build versioning, analytics). |
| `npm run typecheck` | Type-checks all TypeScript without building. |
| `npm run demo-data` | Regenerates the synthetic `demo_*` files. |

---

## 2. Adding your own data

1. **Copy your files into the tracks folder:** `tracks/new_data/` here, or whatever `tracksDir` in `tracks.config.ts` points to (default `tracks/`). Only that one folder is read; subfolders are ignored. Supported formats (each may also be gzipped, e.g. `atac.bedGraph.gz`):

   | Extension | Format | Notes |
   | --- | --- | --- |
   | `.wig` | WIG `fixedStep` and/or `variableStep` | Positions in the file are 1-based, as the WIG spec says. |
   | `.bedGraph`, `.bg` | bedGraph | `chrom start end value`, 0-based. |
   | `.bed` | BED3 to BED12 | Gene models (BED12), `itemRgb` colors, scores, strands. |

   UCSC `track` header lines are honored (`name`, `description`, `color`, `altColor`, `visibility`, `itemRgb`, `viewLimits`, `windowingFunction`, `graphType`, `maxHeightPixels`), so UCSC custom-track files work unchanged.

2. **If your genome is not hg38,** replace `genome/chrom.sizes` (see [Genome files](#4-genome-files)).
3. **Run `npm run build`.** Every supported file in the tracks folder becomes a track automatically, named after its `track name=` line or its file name.
4. **Optional:** style and order tracks in `tracks.config.ts`, and describe them in `help/tracks/<id>.md`.

Binary **bigWig / bigBed** files are not read directly. Convert them with the UCSC tools:



```bash
bigWigToBedGraph input.bw output.bedGraph
bigBedToBed input.bb output.bed
```

### Track ids

A track's **id** is its file name without extension(s): `atac.bedGraph.gz` → `atac`. Ids are used as config keys, help file names (`help/tracks/atac.md`) and help links (`#/help/track-atac`). Two files with the same id (e.g. `atac.wig` and `atac.bed`) are a build error; rename one.

### Pairing a signal with its peaks

Every file is its own independent track. To get the figure look where peaks sit tight under their signal in the same color, give them the same `color`, an empty `label`, and a small `marginTop`:

```ts
'atac.bedGraph':  { label: 'ATAC', color: '#5f6368', yLabel: 'log_{2}FC' },
'atac_peaks.bed': { label: '', color: '#5f6368', mode: 'dense', marginTop: 2 },
```

A track with an empty label is still draggable and hideable from the left gutter on hover, and is listed in the hidden-tracks tray and help page under its file name.

---

## 3. `tracks.config.ts` reference

The file is optional. Delete it and everything still builds with defaults. Because it is TypeScript, your editor autocompletes option names and shows what each one does; a typo such as `colr` fails the build with *Did you mean "color"?*

```ts
import { defineConfig } from './build/config-schema';

export default defineConfig({
  title: 'Lab Genome Browser',
  subtitle: 'hg38, March 2026 release',
  defaultPosition: 'chr7:55,000,001-55,300,000',
  tracks: {
    'h3k27ac.wig': { label: 'H3K27ac', color: '#0a7', height: 60, yLabel: 'log_{2}FC' },
    'peaks.bed':   { mode: 'dense', hidden: true },
  },
});
```

### Top-level settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `title` | `"Genome Browser"` | Shown in the header and the browser tab. |
| `subtitle` | none | Smaller text next to the title. |
| `defaultPosition` | data extent | Where the viewer opens, 1-based like UCSC. If omitted, the region spanning the data on the chromosome with the most data. |
| `genome.chromSizes` | `"genome/chrom.sizes"` | Path to the chromosome sizes file. |
| `genome.fasta` | first `*.fa` in `genome/` | Path to a FASTA file, or `false` for no sequence track. |
| `sequenceTrack.label` | `"Sequence"` | Name of the built-in sequence track. |
| `sequenceTrack.hidden` | `false` | Start with the sequence track in the hidden tray. |
| `maxDataMB` | `200` | Build fails if bundled data exceeds this. A warning appears above 50 MB. |
| `tracks` | `{}` | Per-track settings, keyed by file name or id. **Order here = order in the viewer.** Files not listed follow alphabetically. |
| `tracksDir` | `"tracks"` | Folder scanned for track files, relative to the project root. This project uses `"tracks/new_data"`. |
| `analytics.goatcounter` | none | GoatCounter count endpoint, `"https://<code>.goatcounter.com/count"`. Omit to count nothing. See [Analytics](#13-analytics). |

### Per-track settings

| Setting | Applies to | Default | Meaning |
| --- | --- | --- | --- |
| `label` | all | `track name=` or id | Name left of the track. `""` hides it. |
| `color` | all | palette | Any CSS color. |
| `altColor` | signal | `color` | Color for negative values. |
| `height` | signal | `50` | Track height in px. BED tracks size themselves from their rows. |
| `marginTop` | all | `6` | Space above the track in px. |
| `yLabel` | signal | none | Rotated axis title. `_{}` = subscript, `^{}` = superscript: `"-log_{10} p"`, `"log_{2}FC"`. A leading `-` becomes a real minus sign. |
| `viewLimits` | signal | autoscale | Fixed y range, e.g. `[0, 50]`. |
| `autoscaleGroup` | signal | none | Tracks with the same group name share one autoscaled range, so heights are comparable. |
| `windowing` | signal | `"max"` | How bases inside one pixel are summarized: `"max"`, `"mean"`, `"min"`, `"mean+whiskers"` (mean bar on a lighter min–max band). |
| `graphType` | signal | `"bar"` | `"bar"` or `"points"`. |
| `mode` | BED | `"pack"` | `"dense"` (one row), `"squish"` (thin packed rows), `"pack"` (packed rows with names), `"full"` (one row per feature). |
| `hidden` | all | `false` | Start in the hidden-tracks tray. |
| `itemRgb` | BED | auto | Color features from BED column 9. On automatically when that column has colors. |
| `centerLine` | BED | `false` | Thin gray line through the middle of each row (nice for dense rows). |
| `featureLabels` | BED | `true` | Draw feature names in pack/full mode. |
| `centerLabel` | all | `false` | Center the track name vertically on the track instead of aligning it to the top. |
| `after` | all | none | The track(s) this one belongs under: a file name or id, or a list of them. When this track is re-added from the hidden tray, it goes just below the lowest visible of them (and below their other followers). Dragging ignores it. |
| `missingParentName` | all | none | Label to show instead while every track in `after` is hidden, e.g. so an unlabeled peaks track still has a name. Has no effect without `after`. |

Precedence: built-in defaults < the file's `track` line < `tracks.config.ts`. Viewers can still change mode, windowing and scaling from the right-click menu; that choice is remembered in their browser only.

---

## 4. Genome files

`genome/` holds files describing the assembly.

**`chrom.sizes` (required).** One chromosome per line: `name<TAB>length`. The bundled file is hg38's primary chromosomes. For another assembly, download its sizes from UCSC, for example:

```
https://hgdownload.soe.ucsc.edu/goldenPath/mm39/bigZips/mm39.chrom.sizes
```

You can trim it to the chromosomes you need; data on chromosomes not listed is skipped with a build warning. Chromosome names must match your track files exactly (`chr7` vs `7`).

**FASTA (optional).** Gives the sequence track, which shows letters at high zoom. Set `genome.fasta` in `tracks.config.ts` to choose the file (this project uses `genome/hg38_ldlr_region.fa`); if it isn't set, the first `*.fa`, `*.fasta` or `*.fna` (optionally `.gz`) in `genome/` is used. The header decides placement:

```
>chr7                      the whole chromosome, starting at base 1
>chr7:55000001-55300000    a slice (1-based, inclusive, UCSC style)
```

The sequence is stored at 2 bits per base, so 1 Mb costs about 0.33 MB in the HTML (plus base64 overhead). A whole human genome is far too large for one HTML file; supply only the regions people will look at. `genome/hg38_ldlr_region.fa` is real hg38 sequence around *LDLR*; `genome/demo_sequence.fa` is **random sequence** for the demo files only.

---

## 5. Help pages and images

The Help tab is built from Markdown when you run `npm run build`:

```
help/
├─ index.md              general text, shown first
├─ images/               images (any folder works; paths are relative to the .md file)
└─ tracks/
   ├─ atac.md            text for the track whose id is "atac"
   └─ sequence.md        text for the built-in sequence track
```

- **Table of contents:** `##` and `###` headings in `index.md` become the contents sidebar, followed by a **Tracks** entry listing every track. The `#` heading is the page title.
- **Every track gets a section** with an automatic facts box (source file, format, counts, chromosomes, value range). Your `help/tracks/<id>.md` text appears under it. Tracks without a help file are listed as build warnings.
- **Clicking a track name in the viewer** opens its section. Inside your Markdown, link to a track with `[ATAC](#track-atac)` or to a heading with `[Getting around](#getting-around)`; these links are rewritten to work with the page router.
- Headings inside a track file are nested under the track title automatically, so write them from `#` as usual.
- Full Markdown is supported: lists, tables, code blocks, bold/italic, links. Raw HTML works too.

### Images

Use normal Markdown image syntax. The image is read from disk at build time and embedded in the HTML:

```markdown
![ATAC signal at the promoter](images/atac-example.png)
```

Add a title to get a captioned figure:

```markdown
![ATAC signal](images/atac-example.png "Figure 2. ATAC signal at the promoter.")
```

For a fixed width, use HTML: `<img src="images/atac-example.png" width="400" alt="ATAC">`.

- Formats: png, jpg, gif, webp, svg. Images are embedded byte-for-byte, never recompressed.
- A missing image **fails the build** with the file and line number.
- Images over 500 KB produce a warning. Shrink large screenshots before adding them, for example `magick in.png -resize 1600x -quality 85 out.jpg`, or export at a smaller size.
- Remote `https://` images are left as links with a warning; they will not load offline.
- Readers can click any image to see it full size.

---

## 6. Using the viewer

| Action | Result |
| --- | --- |
| Scroll sideways (trackpad), or shift + mouse wheel | Move along the chromosome |
| Scroll up/down | Scrolls the page as usual (never captured by the viewer) |
| Alt / option + scroll over the tracks | Zoom in/out around the pointer |
| Drag across the tracks | Zoom to the selected region |
| Double-click the tracks | Zoom out 3× around the pointer |
| Zoom slider (top right), − / + | Zoom from whole chromosome to about 14 px per base |
| Position box | `chr7:55,000,001-55,300,000`, `chr7:55086725` (100 bp around it), or `chr7` |
| ‹ › buttons, ← → keys | Move half a screen / 10% |
| Hover anything | Guide line with coordinate, plus a tooltip with the value or feature |
| Click a BED feature | Pinned details with *Zoom to feature* and *Copy position* |
| Drag a track name (or the grip on hover) | Reorder tracks |
| Hover a track name, click × | Hide the track; it moves to the *Hidden tracks* tray |
| Click a tray chip | Add the track back at the bottom |
| Drag a tray chip into the tracks | Add it back at that exact place |
| Click a track name | Open its section on the Help page |
| Right-click a track name | Display mode, windowing, scaling, hide, about |
| Reset view | Restore the starting position and track layout |

The position is kept in the URL (`#/viewer?pos=chr7:...`), so a bookmark or shared link reopens the same place. The track arrangement is remembered in the viewer's own browser and resets automatically when you rebuild with different data.

---

## 7. What each file does

```
├─ README.md               project overview, links, screenshots
├─ DEVELOPER.md            this file
├─ LICENSE, COPYRIGHT.txt  GPL-3.0 license and third-party notices
├─ package.json            scripts, dependencies, and the version shown in the footer
├─ vite.config.ts          build setup: data plugin, single-file inlining, versioning
├─ tsconfig.json           TypeScript settings
├─ index.html              page shell; %APP_TITLE% is replaced at build time
├─ tracks.config.ts        YOUR settings (optional)
├─ tracks/                 YOUR data files (new_data/ = LDLR tracks, test_tracks/ = demo files)
├─ genome/                 chrom.sizes + optional FASTA
├─ help/                   YOUR help Markdown and images
├─ dist/index.html         the built page (committed; deployed to GitHub Pages)
├─ build-history/          a copy of every build (not committed)
├─ docs/screenshots/       images used in README.md
├─ py_data_manip/          notebooks that prepared the track files
├─ .github/workflows/
│  └─ pages.yml            deploys dist/index.html to GitHub Pages
│
├─ shared/
│  └─ types.ts             data shapes shared by build and browser (the "contract")
│
├─ build/                  runs in Node at build time only
│  ├─ plugin.ts            the Vite plugin: finds files, runs parsers, assembles the bundle,
│  │                       prints the summary, live-reloads in dev
│  ├─ config-schema.ts     tracks.config.ts options, defaults, defineConfig, validation
│  ├─ track-line.ts        UCSC `track` line → style
│  ├─ parse-wig.ts         WIG fixedStep/variableStep + bedGraph → sorted intervals
│  ├─ parse-bed.ts         BED3–12 → column arrays
│  ├─ parse-fasta.ts       FASTA → 2-bit packed sequence
│  ├─ pyramid.ts           zoom-level summaries for signal tracks
│  ├─ encode.ts            typed arrays → base64
│  ├─ help.ts              Markdown → HTML, image inlining, TOC, facts boxes
│  └─ version-file.ts      version + build time for the footer; saves each build to build-history/
│
├─ src/                    runs in the browser
│  ├─ main.ts              entry point: loads data, creates store, mounts pages, starts router
│  ├─ env.d.ts             types for build-provided values (`virtual:genome-data`, footer version/time)
│  ├─ router.ts            #/viewer and #/help routing
│  ├─ state.ts             view position + track layout; URL and localStorage persistence
│  ├─ analytics.ts         GoatCounter visit counting (see Analytics)
│  ├─ core/
│  │  ├─ coords.ts         0-based ↔ 1-based conversion, position parsing, nice numbers
│  │  └─ packing.ts        row packing for BED features
│  ├─ data/
│  │  ├─ decode.ts         base64 → typed arrays, base lookup
│  │  ├─ query.ts          what's on screen: per-pixel signal summaries, BED range search
│  │  └─ tracks.ts         runtime track objects with lazy per-chromosome decoding
│  ├─ render/
│  │  ├─ canvas.ts         HiDPI canvas setup, sub/superscript text, theme colors
│  │  ├─ axis.ts           coordinate ruler and scale bar
│  │  ├─ signal.ts         signal bars/points and the y-axis
│  │  ├─ bed.ts            BED layout (4 modes) and gene-model drawing
│  │  └─ sequence.ts       bases / colored ticks
│  ├─ pages/
│  │  ├─ viewer.ts         the viewer: toolbar, rows, all mouse/keyboard handling, render loop, tray
│  │  └─ help.ts           help page: TOC, scroll highlighting, anchors, image lightbox
│  ├─ ui/
│  │  ├─ header.ts         title bar with Viewer | Help tabs
│  │  ├─ drag.ts           drag controller for reordering and tray drops
│  │  ├─ menu.ts           right-click menu
│  │  └─ tooltip.ts        hover tooltip and pinned popup
│  └─ styles/
│     ├─ theme.css         ALL colors, fonts and key sizes (start here to restyle)
│     └─ layout.css        structure and component styles
│
├─ scripts/
│  └─ make-demo-data.ts    generates the synthetic demo files
└─ tests/                  Vitest unit tests
```

---

## 8. How it works

### Build time (`build/`)

`build/plugin.ts` is a Vite plugin. When the app imports `virtual:genome-data`, the plugin:

1. Loads and validates `tracks.config.ts`.
2. Reads `chrom.sizes` and the FASTA (packed to 2 bits per base).
3. Lists `tracks/`, orders files (config order, then alphabetical) and parses each one.
4. For signal tracks, merges identical neighboring values and builds a **zoom pyramid**: summaries (min, max, mean) in bins of 32, 128, 512, … bases. When zoomed out, the viewer reads the coarsest level still finer than a pixel, so drawing costs about one value per pixel regardless of file size. This is the same idea as bigWig zoom levels.
5. Encodes numbers as base64 typed arrays (compact, no parsing on load).
6. Renders the help Markdown and inlines its images.
7. Hashes the result (used to reset saved layouts when data changes) and returns it as a JavaScript module.

`vite-plugin-singlefile` then inlines all JavaScript and CSS into `dist/index.html`.

`build/version-file.ts` is a second, smaller plugin. When the build starts it reads the version from `package.json` and the current time (UTC) and passes both to the page for the viewer footer; after `dist/index.html` is written it saves a copy to `build-history/` named with the same version and time.

### Run time (`src/`)

- **State** (`state.ts`) holds the view (`chrom`, `start`, `end`) and the layout (order, hidden, per-track overrides). Everything else subscribes to it.
- **Rendering** (`pages/viewer.ts` → `render()`) runs at most once per animation frame. It computes per-pixel summaries for visible signal tracks, works out y ranges (fixed, own autoscale, or shared group), then draws each track on its own canvas. Every frame redraws only the visible window; there is no off-screen buffer, which keeps the code simple and is fast enough because panning comes from scroll events rather than click-dragging.
- **Data** is decoded lazily, one chromosome per track the first time it is shown.

### Coordinates

Internally everything is **0-based, half-open** (`[start, end)`, as in BED). The UI shows **1-based inclusive** positions like UCSC. All conversion lives in `src/core/coords.ts`; if you add features that display or accept positions, use its functions.

---

## 9. Changing the look

- **Colors, fonts, sizes:** `src/styles/theme.css`. All UI colors are CSS variables (`--ink`, `--muted`, `--accent`, `--hairline`, …), the font stack is `--font-sans`, the left column width is `--gutter-width`. The canvas drawings (axis, ticks, sequence hint) read the same variables, so one edit restyles both.
- **Track colors, heights, spacing:** `tracks.config.ts`.
- **Layout and components** (header, toolbar, tray, tooltips, help page): `src/styles/layout.css`, organized by section.
- **Header contents:** `src/ui/header.ts`. **Toolbar buttons:** the template at the top of `createViewer` in `src/pages/viewer.ts`.
- **How signals and features are drawn:** `src/render/signal.ts` and `src/render/bed.ts`. Row heights per BED mode are in `ROW_HEIGHT`; the y-axis area width is `YAXIS_W` in `viewer.ts`.
- **Base colors:** `BASE_COLORS` in `src/render/sequence.ts`.
- **Maximum zoom:** `MAX_PX_PER_BASE` in `src/state.ts`.
- **Favicon:** the emoji in `index.html`.

Use `npm run dev` while restyling; changes appear instantly.

---

## 10. Large data

Everything lives in one HTML file that the browser loads into memory, so size matters.

- The build prints the bundled data size. Above 50 MB you get a warning; above `maxDataMB` (default 200) the build stops.
- Rough costs: a signal interval is 12 bytes before base64 (16 after), plus a few percent for the zoom pyramid. One million 1-bp WIG values ≈ 16 MB, but runs of equal values are merged, so bedGraphs of real coverage are often much smaller.
- To shrink: bin signals coarser (e.g. 10–50 bp) before building, restrict files to the regions or chromosomes you need, drop near-zero intervals from bedGraphs, and keep FASTA to regions of interest.
- Gzipped input files are fine (`.gz`), but compression does not carry into the HTML.

---

## 11. Troubleshooting

| Problem | Fix |
| --- | --- |
| *"N value(s) on "7" skipped: chromosome not in chrom.sizes"* | Names differ: `7` vs `chr7`. Rename in the data or in `chrom.sizes`. |
| *"tracks.config.ts refers to file(s) not found in tracks/"* | A config key doesn't match a file name; the message suggests the closest one. |
| *"Help image not found"* | The path is relative to the `.md` file it's in. |
| Track missing in viewer | Is the extension supported? Is it in the hidden tray? Is the viewer on the right chromosome? |
| Old track order after rebuilding | Saved layouts reset automatically when data changes. Otherwise press **Reset view**. |
| Alt + scroll doesn't zoom on Linux | Some desktops use Alt + drag/scroll for windows. Use the zoom slider or drag-select instead, or change the desktop shortcut. |
| Page is slow with lots of data | See [Large data](#10-large-data). |

---

## 12. Unit Testing

Tests are in `tests/` and use [Vitest](https://vitest.dev). Run them all with `npm test`, or one file:

```
npx vitest run tests/build.test.ts
```

---

## 13. Analytics

Visits are counted with [GoatCounter](https://www.goatcounter.com): no cookies, no consent banner, and IP addresses are never stored.

**Monitor:** sign in at https://ldlr-noncoding.goatcounter.com to see visitors, pageviews, referrers and locations (country and region). Use **Settings → Export** to download the raw data as CSV; export quarterly as a backup.

**What is counted:** one hit when the page loads, and one each time a visitor switches between the viewer and help. Panning, zooming and hiding tracks are not counted. GoatCounter counts a visitor once per page per ~8 hours.

**Separating deployments:** every hit's path starts with where the page was served from, so filter the dashboard by prefix:

| Path prefix | Source |
| --- | --- |
| `emmerlab.org/ldlr-noncoding` | production |
| `emmerlab.github.io/LDLR-noncoding-browser/` | dev build (GitHub Pages) |
| `localhost:<port>/` | local build (`npm run preview`) |
| `file` | local build opened as a file |

`npm run dev` never counts. Visitors with ad blockers may not be counted, so treat totals as a minimum.

**Code:** `src/analytics.ts` sends the counts (it calls GoatCounter's [count endpoint](https://www.goatcounter.com/help/pixel) directly rather than loading `count.js`); `src/main.ts` calls it on page switches. The endpoint is `analytics.goatcounter` in `tracks.config.ts`; remove it to turn counting off.

---

## 14. Versions and deployment

**Version and footer.** The viewer footer shows `version <x.y.z> (last modified YY-MM-DD HH:MM UTC)`. The version is `version` in `package.json`; the time is when `npm run build` ran. To release a new version, bump `version` in `package.json` before building.

**Build history.** Every `npm run build` also saves a copy of the page as `build-history/build-<version>-<YYMMDD-HHMMSS>.html` (same version and UTC time as the footer). The folder is not committed; it is a local record of past builds.

**Deployment.**

| Site | URL | How it updates |
| --- | --- | --- |
| Dev build | https://emmerlab.github.io/LDLR-noncoding-browser | Automatically: `.github/workflows/pages.yml` deploys `dist/index.html` whenever a push to `main` changes it. You can also run the workflow by hand from the repository's **Actions** tab. |
| Production | https://emmerlab.org/ldlr-noncoding | Updated separately from this repository. |

So to publish a change to the dev build: bump the version if needed, run `npm run build`, commit `dist/index.html` with the source changes, and push to `main`.
