# Firefox Addon — GitHub Copilot Usage Monitor

A Firefox extension that displays your **GitHub Copilot premium request usage**
as a visual battery bar, so you can glance at the toolbar icon or open the popup
to see what percentage of requests have been used or remain.

---

## Features

| Feature | Details |
|---|---|
| 🔋 Battery bar | Fills left-to-right as usage rises (green → amber → red) |
| % badge | Toolbar icon badge shows your current usage % |
| Silent background refresh | The addon fetches your usage in the background using your existing GitHub session — no tab needs to stay open |
| Decimal precision | Correctly reads fractional percentages (e.g. `12.3%`) |
| Reset countdown | Shows how many days until your next monthly reset |
| Live updates | Popup updates in real-time while the GitHub settings page is open |
| One-click refresh | "Open Settings & Refresh" button opens / reloads the settings page |

---

## How it works

1. The extension runs a **content script** on
   `https://github.com/settings/copilot/features`.
2. When you visit that page the script reads the *Premium requests* usage
   percentage from the DOM and saves it to extension storage.
3. The **popup** reads from storage and renders the battery bar, labels,
   and a countdown in days until the monthly reset.
4. A **background alarm** refreshes your usage every hour by silently
   fetching the settings page using your existing GitHub session cookies
   (no OAuth required). If the fetch fails (e.g. you're signed out), the
   addon falls back to reloading any open settings tab.

---

## Installation (Developer Mode)

1. Clone or download this repository.
2. Open Firefox and go to `about:debugging`.
3. Click **"This Firefox"** → **"Load Temporary Add-on…"**
4. Select the `manifest.json` file in this directory.
5. Visit `https://github.com/settings/copilot/features` once to populate the
   initial data.
6. Click the extension icon in the toolbar to see your usage.

### Installing the packaged `.zip` from a Release or CI build

If you want to install the packaged `.zip` directly instead of loading the
source folder:

- **From a GitHub Release:** download the `github-copilot-monitor-<version>.zip`
  asset attached to the release. This file is the installable extension.
  Releases are published automatically by CI on every push to `main`, tagged
  `v<manifest.version>` — so the latest release always matches the current
  `manifest.json` version.
- **From an Actions run:** download the `github-copilot-monitor-<version>`
  artifact. GitHub Actions always delivers artifacts wrapped in a `.zip`, so
  what you download already **is** the installable archive — don't re-zip it
  and don't try to install the outer wrapper if you unzipped it first.

Then in Firefox, open `about:debugging` → **This Firefox** → **Load Temporary
Add-on…** and select the `.zip`. If Firefox reports *"does not contain a valid
manifest"*, the archive you selected does not have `manifest.json` at its
top level — open the zip and confirm you aren't looking at a zip-of-a-zip.

---

## File Structure

```
firefox-addon-github-copilot-monitor/
├── manifest.json       Extension manifest (MV2)
├── background.js       Event-page background script (silent fetch + badge)
├── content.js          Content script (reads usage from GitHub DOM)
├── extractor.js        Shared usage-extraction logic
├── popup/
│   ├── popup.html      Popup markup
│   ├── popup.css       Popup styles
│   └── popup.js        Popup logic
└── icons/
    ├── icon-48.svg
    └── icon-96.svg
```

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist usage data between sessions |
| `alarms` | Periodic background refresh |
| `https://github.com/settings/copilot/*` | Read content from the Copilot settings pages and `fetch()` them silently in the background to refresh usage without requiring an open tab |
