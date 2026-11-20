# FOLLOW/BACK

A single-page Instagram follow-back checker with a calm, soft-coloured design. Drop in your Instagram data
export and see who does not follow you back, who you do not follow back, and what
changed since last time.

Everything runs in your browser. No Instagram login, no account, no upload.

**Live:** https://ornate-klepon-08fbc8.netlify.app/ (deploys from `main` automatically)

## It really does run locally

Most follower-checker sites ask for your Instagram password and send your data to a
server. This one has no server to send anything to, and you do not have to take that
on faith:

- The page makes **zero network requests**. JSZip is bundled, not fetched from a CDN.
- A strict Content-Security-Policy sets `connect-src 'none'`, so the browser itself
  blocks any attempt to phone home, including one introduced by accident.
- `script-src` is pinned to the sha256 of the page's own script. Nothing else runs.
- Open DevTools, go to the Network tab and reload. Nothing but the page.

- Netlify also sends the same policy as a real HTTP header, plus `frame-ancestors 'none'`,
  `nosniff` and a strict referrer policy.

`tools/verify.js` enforces all of that - 34 invariants - and CI runs it alongside
eslint, a typecheck, the unit suite and Playwright browser tests, so a regression
breaks the build.

## Features

- Reads the Instagram ZIP as it downloads, or loose JSON/HTML files
- **Compare two ZIPs at once**: drop an older and a newer export together to see who
  unfollowed you in between, with no saved history needed
- One big answer first: how many people do not follow you back
- Lists: Not back, You skip, Mutual, Unfollowed you, New followers, Boomerang,
  Pending out, Requests in, You unfollowed, Blocked, Restricted, Close friends
- **Count check** that catches the wrong-date-range mistake before you trust the numbers
- **Queue mode** - a keyboard-driven pass to work through a list: open, tick off, snooze, skip
- **Insights**: growth, churn, median days-to-unfollow, and month-by-month retention
- **Timeline** of every follow and unfollow, with dates, across all your snapshots
- **Boomerang** list: accounts that followed you and then unfollowed
- Per-account history: expand any row to see its full follow/unfollow timeline
- A to-scale history chart of followers, following and not-following-back
- Snapshot comparison, labelling and deletion
- Sort by follow date; snooze until next upload, or always-skip for good
- Bulk actions, CSV and JSON downloads
- **Password-protected backups** (AES-256, key stretched with PBKDF2), restored the same way
- **Summary image**: a PNG card of your numbers to share, with no usernames on it
- **Share to the app** on Android: once installed, share the downloaded ZIP straight
  from the Files app
- **English, Hindi and Odia** interface; reads follow dates from exports in 30+ languages
- Asks before a refresh throws away loaded results
- Soft light and dark themes that are easy on the eyes; installable and fully offline

## How to get your file

1. Instagram: Settings, then Accounts Center
2. Your information and permissions, then Download your information
3. Choose **Followers and following** only, format **JSON**, date range **All time**
4. Request the download, wait for the email, and download the ZIP
5. Drop the ZIP onto the page. Do not unzip it.

Date range **All time** is the one that matters. Anything else silently truncates the
export and every number comes out wrong. After uploading, type the follower count from
your profile into the count check box and the page will tell you whether the export is
complete.

## Nothing is saved

The page keeps your data in memory for as long as the tab is open, and nowhere else.
Refresh or close it and everything is gone: the page starts over and asks for your ZIP
again. Anything an older version saved in your browser is deleted on load.

To compare two exports over time, upload one, download the backup file, and restore it
next time before uploading the newer ZIP. Each upload in the same tab adds a snapshot,
which is what unlocks the timeline, the Unfollowed-you list and the chart.

## Usage and deploy

Open `followback/index.html` in a browser - no server, no build step. To host it, any
static host works; for GitHub Pages, Settings, then Pages, then deploy from the branch
root, and the app is at `/followback/`.

## Development

Source lives in `followback/src/` as ES modules; `followback/index.html` is generated.
See [followback/README.md](followback/README.md).

```bash
cd followback
npm install
npm test          # 131 unit + integration tests
npm run check     # build + lint + typecheck + test + verify
npm run test:e2e  # Playwright smoke tests in a real browser
```

## A note on unfollowing

Queue mode opens profiles so you can unfollow by hand. It never automates Instagram -
that breaks their terms and risks your account. Instagram also rate-limits bulk
unfollowing, so pace yourself at roughly 100 to 200 a day.

## Limitations

- Instagram's export is a snapshot, not a feed. Unfollows are detected by comparing
  uploads, so the gap between uploads is the resolution you get. The export's
  "recently unfollowed" list fills some of that in on the first upload.
- The export has no verified badge, private flag, follower count or bio, so none of
  that can be shown.
- HTML exports carry less reliable dates than JSON ones. Pick JSON.

## License

MIT - see [followback/LICENSE](followback/LICENSE).
