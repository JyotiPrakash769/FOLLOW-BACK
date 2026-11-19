# FOLLOW/BACK

A brutalist, single-page Instagram follow-back checker. Drop in your Instagram data
export and see who does not follow you back, who you do not follow back, and what
changed since last time.

Everything runs in your browser. No Instagram login, no account, no upload.

**Live demo:** https://jyotiprakash769.github.io/FOLLOW-BACK/followback/
(enable GitHub Pages on this repo to serve it)

## It really does run locally

Most follower-checker sites ask for your Instagram password and send your data to a
server. This one has no server to send anything to, and you do not have to take that
on faith:

- The page makes **zero network requests**. JSZip is bundled, not fetched from a CDN.
- A strict Content-Security-Policy sets `connect-src 'none'`, so the browser itself
  blocks any attempt to phone home, including one introduced by accident.
- `script-src` is pinned to the sha256 of the page's own script. Nothing else runs.
- Open DevTools, go to the Network tab and reload. Nothing but the page.

`npm run check` enforces all of that in CI, so a regression breaks the build.

## Features

- Reads the Instagram ZIP as it downloads, or loose JSON/HTML files
- One big answer first: how many people do not follow you back
- Lists: Not back, You skip, Mutual, Unfollowed you, New followers, Boomerang,
  Pending out, Requests in, You unfollowed, Blocked, Restricted, Close friends
- **Count check** that catches the wrong-date-range mistake before you trust the numbers
- **Timeline** of every follow and unfollow, with dates, across all your snapshots
- **Boomerang** list: accounts that followed you and then unfollowed
- Saved snapshots with a history chart, plus comparison between any two
- Sort by follow date, newest or oldest
- Hide accounts you do not care about; tick people off as you unfollow them
- Select all and hide or tick in bulk
- Banner showing what changed since your last upload, with a reminder after 14 days
- CSV download, and a backup file you can download and restore
- Snapshot manager: label snapshots, delete a bad one
- Light and dark themes
- Installable, and works offline

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

Upload a fresh ZIP every week or two. Each upload adds a snapshot, which is what
unlocks the timeline, the Unfollowed-you list and the chart.

## Where your history lives

In this browser's localStorage, and nowhere else. Clearing site data erases it, and it
does not follow you to another browser or phone. Download the backup file if you want
to keep it or move it.

Usernames are stored once and snapshots reference them by id, so a year of weekly
uploads fits comfortably. The page shows how much of the browser's roughly 5 MB limit
you are using, and offers to drop the oldest snapshots if you ever fill it.

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
npm test        # 74 tests
npm run check   # build + test + privacy/CSP invariants
```

## Limitations

- Instagram's export is a snapshot, not a feed. Unfollows are detected by comparing
  uploads, so the gap between uploads is the resolution you get. The export's
  "recently unfollowed" list fills some of that in on the first upload.
- The export has no verified badge, private flag, follower count or bio, so none of
  that can be shown.
- HTML exports carry less reliable dates than JSON ones. Pick JSON.

## License

MIT - see [followback/LICENSE](followback/LICENSE).
