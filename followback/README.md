# followback/ - the app

The app is `index.html`, with `worker.js` beside it. Both are **generated** from
`src/` by `build.js` and committed, so GitHub Pages serves them with no build and
`index.html` opens straight from the filesystem.

Edit `src/`, never `index.html`.

```
src/parse.js            username + timestamp extraction, locale-aware dates (pure)
src/db.js               forgetSaved(): wipes what versions up to 3.0 saved
src/store.js            in-memory snapshot store, event log, insights, memoized lists
src/i18n.js             English, Hindi and Odia strings
src/crypt.js            password-protected backups (Web Crypto, PBKDF2 + AES-GCM)
src/card.js             the shareable summary image (canvas)
src/gather.js           turns dropped files or a ZIP into a snapshot payload
src/ui.js               DOM, rendering, queue mode, interaction
src/worker.js           worker glue around gather()
src/index.template.html markup, with CSP/style/script placeholders
src/style.css           styles
vendor/jszip.min.js     bundled, never fetched
build.js                strips module syntax, concatenates, inlines, hashes for CSP,
                        and writes Netlify's _headers with the same CSP
tools/verify.js         asserts the privacy, CSP, service-worker and size invariants
tools/serve.js          dependency-free static server for local testing
```

```bash
npm install
npm test          # 131 unit + integration tests (vitest + jsdom)
npm run test:e2e  # Playwright smoke tests against the built page
npm run lint      # eslint
npm run typecheck # tsc --checkJs over src/ (no .ts rename, no build change)
npm run build     # regenerate index.html + worker.js
npm run check     # build + lint + typecheck + test + verify, the CI gate
npm run serve     # http://localhost:8080
```

## Persistence

There is none, on purpose. The store lives in memory, so a reload starts over at the
upload screen. On load the page calls `forgetSaved()`, which deletes the IndexedDB
database and localStorage keys that versions up to 3.0 wrote. Ways to carry history
between visits: drop an old and a new ZIP together, or download a (password-protected)
backup and restore it. The chosen language rides in the address (`?lang=hi`), not
in storage.

The service worker is network first, with the cache only as an offline fallback. It
caches app files only. A ZIP shared to the installed app waits in a cache for the
page to pick it up, and the page deletes it as soon as it has read it.

## How the build stays honest

`npm run build` recomputes the sha256 of the inlined script and writes it into the
page's `script-src`, so a stale build is a hard CSP failure rather than a silent
one. `tools/verify.js` then asserts 34 invariants: no external origins, no network
calls in the script, `connect-src 'none'`, the service-worker precache list matches
the files on disk, the manifest is installable, and the page is within its size
budget. CI runs lint, format, typecheck, the full test suite, the build, verify, the
Playwright smoke tests, and fails if the committed build differs from a fresh one.
