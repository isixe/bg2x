// The desktop build is this same SPA loaded by Electron, so the user agent is
// the only signal available without exposing a preload bridge just for this.
export const IS_DESKTOP = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent);
