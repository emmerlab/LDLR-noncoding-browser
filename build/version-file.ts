/**
 * build/version-file.ts
 * ----------------------------------------------------------------------------
 * The one place that knows the build's version and time.
 *
 *   version   `version` from package.json (0.0.0 if missing)
 *   builtAt   captured once when Vite loads its config, in UTC
 *
 * Both are used for:
 *   - the viewer footer: exposed to the app as __APP_VERSION__ / __BUILD_TIME__
 *     (dev and build), e.g. "1.0.1" and "26-10-22 03:57 UTC"
 *   - build history (build only): after the bundle is written, dist/index.html
 *     is copied to build-history/build-<version>-<YYMMDD-HHMMSS>.html
 */

import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

/** UTC date/time fields; the footer and the build-history file name both use these. */
function utcParts(dateTime: Date) {
  const iso = dateTime.toISOString(); // YYYY-MM-DDTHH:MM:SS.sssZ
  return {
    yy: iso.slice(2, 4), mo: iso.slice(5, 7), dd: iso.slice(8, 10),
    hh: iso.slice(11, 13), mi: iso.slice(14, 16), ss: iso.slice(17, 19),
  };
}

export function getBuildFileName(version: string, dateTime: Date = new Date()): string {
  const t = utcParts(dateTime);
  return `build-${version}-${t.yy}${t.mo}${t.dd}-${t.hh}${t.mi}${t.ss}.html`;
}

/** Build time for the page footer: "YY-MM-DD HH:MM UTC". */
export function formatBuildTime(dateTime: Date = new Date()): string {
  const t = utcParts(dateTime);
  return `${t.yy}-${t.mo}-${t.dd} ${t.hh}:${t.mi} UTC`;
}

const FALLBACK_VERSION = '0.0.0';

/**
 * `version` from <root>/package.json. Falls back to 0.0.0 if the field is
 * missing; returns null if the file can't be read (both with a warning).
 */
export function readVersion(root: string): string | null {
  let pkg: { version?: string };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch (err) {
    console.warn(`[version-data] could not read package.json: ${(err as Error).message}`);
    return null;
  }
  if (!pkg.version) {
    console.warn(`[version-data] package.json has no "version"; using ${FALLBACK_VERSION}`);
    return FALLBACK_VERSION;
  }
  return pkg.version;
}

export function versionCurrentBuild(indexFilePath: string,
                                    historyDir: string,
                                    newFileName: string): string {
  if (!fs.existsSync(indexFilePath)) {
    // raise an error if the index.html file does not exist
    throw new Error(`index.html file does not exist at path: ${indexFilePath}`);
  }
  fs.mkdirSync(historyDir, { recursive: true });
  const destFilePath = path.join(historyDir, newFileName);
  fs.copyFileSync(indexFilePath, destFilePath);
  return destFilePath;
}

export function versionData(options: { root?: string } = {}): Plugin {
  const root = options.root ?? process.cwd();
  let outDir = path.join(root, 'dist');
  let isBuild = false;
  let version: string | null = null; // null: package.json unreadable, so the build isn't archived
  let builtAt: Date;

  return {
    name: 'version-data',
    // Runs for dev and build, so the footer always has a value.
    config(_userConfig, env) {
      isBuild = env.command === 'build';
      version = readVersion(root);
      builtAt = new Date();
      return {
        define: {
          __APP_VERSION__: JSON.stringify(version ?? FALLBACK_VERSION),
          __BUILD_TIME__: JSON.stringify(formatBuildTime(builtAt)),
        },
      };
    },
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!isBuild) return; // never archives for the dev server
      if (version === null) {
        console.warn('[version-data] build not versioned: package.json could not be read');
        return;
      }
      try {
        const indexFilePath = path.join(outDir, 'index.html');
        const historyDir = path.join(path.dirname(outDir), 'build-history');
        const saved = versionCurrentBuild(indexFilePath, historyDir, getBuildFileName(version, builtAt));
        console.log(`[version-data] saved ${path.relative(root, saved)}`);
      } catch (err) {
        console.warn(`[version-data] build not versioned: ${(err as Error).message}`);
      }
    },
  };
}
