# Changelog

## 3.1.0

### Changed

- **Nothing is saved between visits.** Data lives in the open tab only. Refreshing or
  closing the page clears it, and the page asks for your ZIP again. Anything earlier
  versions saved (IndexedDB and localStorage) is deleted on load. Use backup download
  and restore to compare exports over time.
- **New deploys show up straight away.** The service worker served the cached page
  first and never updated it, so returning visitors kept seeing an old version. It is
  now network first, falling back to the cache only when offline.

## 3.0.0

Scale, analysis and the actual unfollow workflow, on top of a typechecked and
browser-tested build. Storage moved to IndexedDB; existing history migrates on
first load and old backups still restore.

### Added

- **Queue mode.** A keyboard-driven pass through any list: j/k to move, space to
  open a profile and tick it off, s to snooze, a to always-skip, plus an "open next
  10" button. Carries an honest pacing warning - Instagram rate-limits bulk
  unfollowing - and states plainly that the page never automates Instagram itself.
- **Insights panel.** Growth and churn per period, median days-to-unfollow for
  boomerangs, best and worst periods, and month-by-month cohort retention (of the
  followers gained in a month, how many are still here).
- **Per-account history.** Expand any row to see that account's full follow and
  unfollow timeline, drawn from the event log.
- **Allowlist versus snooze.** Hiding is now two actions: "always skip" for accounts
  you follow on purpose, and "snooze" which lasts only until the next upload.
- **Time-proportional chart.** The x-axis is now to scale, so a one-day gap and a
  two-month gap no longer look identical. Adds dated ticks, a third line for
  not-following-back, and hover tooltips with exact values.
- **Dates in any language.** HTML exports are parsed for month names across 30-plus
  languages, including Hindi, Bengali, Odia, Tamil and more, with native numerals
  normalised. An export whose dates cannot be read at all now says so and points to
  the JSON format.

### Changed

- **Storage is now IndexedDB + gzip,** with localStorage as a fallback. This removes
  the ~5 MB ceiling the previous version had to manage, so quota prompts effectively
  never fire. The storage meter now reports real available space.
- **`lists()` is memoized** on a store-version key, so typing in search no longer
  rebuilds every derived list and rescans the event log on each keystroke.

### Fixed

- Localised dates were silently misread - "12 November 2024" in several languages
  came back as December, and some came back as a medieval year that produced a
  negative timestamp. Dates are now clamped to a sane window and parsed per locale.
- `Date.parse` was too lenient and would invent a date from stray numbers; the
  parser now leaves genuinely ambiguous input unparsed rather than guessing.

### Tooling

- Source is type-checked with `tsc --checkJs` (no `.ts` rename, no build change).
- Property-based tests (fast-check) assert the parser never throws and only ever
  emits valid handles, over thousands of random and structured inputs. This is what
  surfaced the negative-timestamp bug above.
- `tools/verify.js` now also checks the service-worker precache against the files on
  disk, validates the manifest for installability, and enforces a page-size budget.
- Playwright smoke tests drive the built page in a real browser: zero cross-origin
  requests, no CSP violations, upload-and-render, and reload-persists-via-IndexedDB.
- eslint and prettier, and a CI gate that runs all of it.

## 2.0.0

Correctness, privacy and scale. The storage format changed; existing history is
migrated automatically on first load, and old backups still restore.

### Fixed

- **The privacy claim is now true.** JSZip was loaded from cdnjs on every visit,
  so a third party saw every visitor and a compromised CDN could have read your
  Instagram data. It is bundled, and a strict CSP with `connect-src 'none'` makes
  "talks to nobody" something you can verify in DevTools.
- **HTML exports produced phantom followers.** Any `instagram.com/<anything>`
  substring counted, so navigation links, post URLs and reel URLs were parsed as
  accounts. Only real profile anchors count now.
- **History outgrew localStorage.** Every snapshot stored the full username list
  again, which exhausted the ~5 MB quota after a few months of weekly uploads - and
  the failure was silent. Usernames are interned and snapshots hold integer ids.
- **Follow dates went missing.** Only the latest two snapshots were searched for a
  timestamp. First-seen dates are now kept permanently.
- **Typing in search redrew everything,** including the SVG chart, on every
  keystroke. Search is debounced and the list renders at most 200 rows at a time.
- **Acting on a row threw keyboard focus to the top of the page.** Rows are patched
  in place, and focus moves to the neighbouring row.
- **Parse failures were swallowed.** The real error is logged and the message names
  what was found and what was missing.

### Added

- Count check against the follower number on your profile, to catch the
  wrong-date-range export mistake.
- Timeline of every follow and unfollow, and a boomerang list.
- Five more export files parsed, including recently-unfollowed.
- Bulk actions, CSV and JSON file downloads, a snapshot manager, a storage meter.
- Installable and offline via a web manifest and a service worker.
- Parsing in a Web Worker with a progress bar and a main-thread fallback.
- Proper tablist semantics with arrow-key navigation.

### Changed

- Source split into tested ES modules under `src/`, with `index.html` generated by
  `build.js`. Tests run on Node 22 in GitHub Actions, which also fails on a stale
  committed build.
