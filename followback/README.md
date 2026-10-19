# FOLLOW/BACK

A brutalist, single-page Instagram follow-back checker. Drop in your Instagram data export and see who doesn't follow you back, who you don't follow back, and what changed since your last upload.

Everything runs in your browser. Your files are never uploaded anywhere, and no Instagram login is needed.

## Features

- Upload the Instagram ZIP as it downloads, or the loose JSON/HTML files
- One big answer first: how many people don't follow you back
- Lists: Not back, You skip, Mutual, Unfollowed you, New followers, Pending requests
- Saved snapshots in your browser, with a history chart
- Compare any two snapshots
- Sort by follow date (newest or oldest)
- Hide accounts you don't care about, and tick people off as you unfollow them
- Banner showing changes since your last upload, with a refresh reminder after 14 days
- Copy any list as CSV
- Backup and restore your history as text
- Light and dark themes

## How to get your Instagram file

1. Instagram: Settings, then Accounts Center
2. Your information and permissions, then Download your information
3. Choose **Followers and following** only, format **JSON**, date range **All time**
4. Request the download, wait for the email, and download the ZIP
5. Drop the ZIP onto the page (no need to unzip)

If the follower count shown after upload doesn't match your profile, re-check that the date range was set to All time.

## Usage

Open `index.html` in a browser, or host it as a static site (see below). It has no build step and no backend.

## Deploy with GitHub Pages

1. Push this repo to GitHub
2. Settings, then Pages
3. Source: deploy from branch `main`, folder `/ (root)`
4. Your site appears at `https://<username>.github.io/<repo>/`

## Privacy

- Files are read and compared locally in your browser
- History is stored in your browser's localStorage, per site address
- Moving to a new address? Use **Make backup** on the old one and **Restore** on the new one
- Never commit your Instagram export to this repository (the `.gitignore` blocks the usual file names)

## Limitations

- Works only with Instagram's official data export, not usernames or logins
- Threads files inside the ZIP are ignored on purpose
- Counts depend on what Instagram puts in the export, so they can differ slightly from your live profile
- Loads JSZip from cdnjs, so it needs an internet connection

## Not affiliated with Instagram

This is an independent personal project and is not affiliated with or endorsed by Instagram or Meta.

## License

MIT, see [LICENSE](LICENSE).
