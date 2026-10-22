/**
 * src/main.ts
 * ----------------------------------------------------------------------------
 * Entry point. Loads the bundled data, creates the store, mounts the header and
 * both pages, and lets the router switch between them.
 */
import bundle from 'virtual:genome-data';
import './styles/theme.css';
import './styles/layout.css';
import { buildTracks } from './data/tracks';
import { Store } from './state';
import { createHeader } from './ui/header';
import { createViewer } from './pages/viewer';
import { createHelpPage } from './pages/help';
import { parsePosition } from './core/coords';
import { replaceHash, startRouter, viewerHash, type Route } from './router';
import { countPageView } from './analytics';

const app = document.getElementById('app')!;
const tracks = buildTracks(bundle);
const store = new Store(bundle.chroms, tracks, bundle.defaultPosition, bundle.buildHash);

const header = createHeader(bundle.title, bundle.subtitle);
const viewer = createViewer(store, bundle.defaultPosition);
const help = createHelpPage(bundle.help);
const main = document.createElement('main');
main.append(viewer.el, help.el);
app.replaceChildren(header.el, main);
document.title = bundle.title;

let page: Route['page'] | null = null; // null until the first route

// Keep the URL hash in step with the view (debounced, no history spam).
let hashTimer = 0;
store.subscribe((what) => {
  if (what !== 'view') return;
  header.setViewerHref(viewerHash(store.positionString()));
  if (page !== 'viewer') return;
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => replaceHash(viewerHash(store.positionString())), 250);
});

startRouter((route) => {
  // Count page switches only, not position changes within the viewer.
  if (route.page !== page) countPageView(bundle.goatcounter, route.page);
  page = route.page;
  header.setPage(route.page);
  viewer.el.hidden = route.page !== 'viewer';
  help.el.hidden = route.page !== 'help';
  if (route.page === 'viewer') {
    if (route.pos) {
      const loc = parsePosition(route.pos, store.chroms);
      if (loc) store.setView(loc);
    }
    viewer.activate();
    replaceHash(viewerHash(store.positionString()));
  } else {
    viewer.deactivate();
    help.show(route.anchor);
  }
});
