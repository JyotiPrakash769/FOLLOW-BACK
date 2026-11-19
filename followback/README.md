# followback/ - the app

The app itself is `index.html`, with `worker.js` beside it. Both are **generated**
from `src/` by `build.js` and committed, so GitHub Pages serves them with no build
and `index.html` opens straight from the filesystem.

Edit `src/`, never `index.html`.

```
src/parse.js            username + timestamp extraction (pure, heavily tested)
src/store.js            snapshot schema v2, event log, quota handling
src/gather.js           turns dropped files or a ZIP into a snapshot payload
src/ui.js               DOM, rendering, interaction
src/worker.js           worker glue around gather()
src/index.template.html markup, with CSP/style/script placeholders
src/style.css           styles
vendor/jszip.min.js     bundled, never fetched
build.js                strips module syntax, concatenates, inlines, hashes for CSP
tools/verify.js         asserts the privacy and CSP invariants hold
tools/serve.js          dependency-free static server for local testing
```

```bash
npm install
npm test          # 74 tests: parser, storage, gather, generated worker, jsdom UI
npm run build     # regenerate index.html + worker.js
npm run check     # build + test + verify, the same gate CI runs
npm run serve     # http://localhost:8080
```

`npm run build` recomputes the sha256 of the inlined script and writes it into the
page's `script-src`, so a stale build is a hard CSP failure rather than a silent
one. CI fails if the committed `index.html` or `worker.js` differs from a fresh
build.
