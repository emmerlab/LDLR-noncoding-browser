/**
 * src/analytics.ts
 * ----------------------------------------------------------------------------
 * Visit counting with GoatCounter (https://www.goatcounter.com). Requests go
 * straight to its documented count endpoint (https://www.goatcounter.com/help/pixel)
 * rather than loading count.js, so the page runs no third-party code and stays
 * one self-contained file.
 *
 * Each hit's path starts with where the page is served from, so a single
 * GoatCounter site keeps the deployments apart:
 *
 *   emmerlab.org/ldlr-noncoding#/viewer                production
 *   emmerlab.github.io/LDLR-noncoding-browser/#/help   dev build (GitHub Pages)
 *   localhost:4173/#/viewer                            local build (npm run preview)
 *   file#/viewer                                       local build opened as a file
 *
 * Only built pages count; `npm run dev` never does. No cookies are set, and
 * GoatCounter doesn't store IP addresses. A blocked or failed request is ignored.
 */
import type { Route } from './router';

type Page = Route['page'];

/** GoatCounter's flag for a headless/automated browser (WebDriver). */
const BOT_WEBDRIVER = 153;

/** Where the page is served from plus the page, e.g. "emmerlab.org/ldlr-noncoding#/viewer". */
export function hitPath(page: Page, loc: Pick<Location, 'protocol' | 'host' | 'pathname'>): string {
  // A file:// path is a folder on someone's computer; report only that it was a file.
  const where = loc.protocol === 'file:' ? 'file' : loc.host + loc.pathname;
  return `${where}#/${page}`;
}

export interface Hit {
  path: string;
  title: string;
  referrer: string;
  /** "width,height,scale" */
  screen: string;
  bot: boolean;
}

/** The count request for one hit (parameters from GoatCounter's pixel docs). */
export function countUrl(endpoint: string, hit: Hit, rnd: string): string {
  const params = new URLSearchParams({
    p: hit.path,
    t: hit.title,
    r: hit.referrer,
    s: hit.screen,
    rnd, // cache buster
  });
  if (hit.bot) params.set('b', String(BOT_WEBDRIVER));
  return `${endpoint}?${params}`;
}

/** Counts one view of `page`. Does nothing without an endpoint or outside a build. */
export function countPageView(endpoint: string | null, page: Page): void {
  if (!endpoint || !import.meta.env.PROD) return;
  const hit: Hit = {
    path: hitPath(page, location),
    title: document.title,
    referrer: document.referrer,
    screen: `${screen.width},${screen.height},${devicePixelRatio}`,
    bot: navigator.webdriver,
  };
  new Image().src = countUrl(endpoint, hit, Math.random().toString(36).slice(2));
}
