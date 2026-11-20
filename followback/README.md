# followback/ - the app

The app is `index.html`, with `worker.js` beside it. Both are **generated** from
`src/` by `build.js` and committed, so GitHub Pages serves them with no build and
`index.html` opens straight from the filesystem.

Edit `src/`, never `index.html`.

```
src/parse.js            username + timestamp extraction, locale-aware dates (pure)
src/db.js               storage adapters, and forgetSaved() which wipes old saved data
src/store.js            snapshot schema v2, event log, insights, memoized lists
src/gather.js           turns dropped files or a ZIP into a snapshot payload
src/ui.js               DOM, rendering, queue mode, interaction
src/worker.js           worker glue around gather()
src/index.template.html markup, with CSP/style/script placeholders
src/style.css           styles
vendor/jszip.min.js     bundled, never fetched
build.js                strips module syntax, concatenates, inlines, hashes for CSP
tools/verify.js         asserts the privacy, CSP, service-worker and size invariants
tools/serve.js          dependency-free static server for local testing
```

```bash
npm install
npm test          # 120 unit + integration tests (vitest + jsdom)
npm run test:e2e  # Playwright smoke tests against the built page
npm run lint      # eslint
npm run typecheck # tsc --checkJs over src/ (no .ts rename, no build change)
npm run build     # regenerate index.html + worker.js
npm run check     # build + lint + typecheck + test + verify, the CI gate
npm run serve     # http://localhost:8080
```

## Persistence

There is none, on purpose. The app runs the store with its in-memory adapter, so a
reload starts over at the upload screen. On load it calls `forgetSaved()`, which
deletes the IndexedDB database and the localStorage keys earlier versions wrote. The
IndexedDB and localStorage adapters stay in `src/db.js` (and tested) so persistence
can be switched back on by passing `defaultAdapter()` to `createStore` in `ui.js`.
Backup download and restore are the way to carry history between visits.

The service worker is network first, with the cache only as an offline fallback, so a
deploy is visible on the next load. It caches app files only, never user data.

## How the build stays honest

`npm run build` recomputes the sha256 of the inlined script and writes it into the
page's `script-src`, so a stale build is a hard CSP failure rather than a silent
one. `tools/verify.js` then asserts 27 invariants: no external origins, no network
calls in the script, `connect-src 'none'`, the service-worker precache list matches
the files on disk, the manifest is installable, and the page is within its size
budget. CI runs lint, format, typecheck, the full test suite, the build, verify, the
Playwright smoke tests, and fails if the committed build differs from a fresh one.
