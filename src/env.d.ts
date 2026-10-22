/**
 * src/env.d.ts: types for the virtual module produced by build/plugin.ts.
 */
/// <reference types="vite/client" />
/** Injected by the versionData plugin (build/version-file.ts). */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare module 'virtual:genome-data' {
  const bundle: import('../shared/types').Bundle;
  export default bundle;
}
