// RACEWORKS image list: key → path (relative to index.html).
// Milestone 0 only needs the loader test pair: one real file and one deliberately missing one.
export const ASSETS = {
  // Real file (the placeholder app icon — the batch-1 art is still raw in assets/_source, which is never published).
  m0Real: 'assets/branding/pwa/icon-512.png',
  // Deliberately missing file: must draw the placeholder box, never crash.
  m0Missing: 'assets/m0-missing-test.png',
};
