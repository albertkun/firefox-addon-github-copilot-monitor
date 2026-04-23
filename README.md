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
| Live updates | Popup updates in real-time while the GitHub settings page is open |
| Reset info | Displays the monthly reset message from GitHub |
| One-click refresh | "Open Settings & Refresh" button opens / reloads the settings page |

---

## How it works

1. The extension runs a **content script** on
   `https://github.com/settings/copilot/features`.
2. When you visit that page the script reads the *Premium requests* usage
   percentage from the DOM and saves it to extension storage.
3. The **popup** reads from storage and renders the battery bar + labels.
4. A **background alarm** reloads the settings page every 60 minutes if it is
   already open in a tab (passive refresh — no new tabs are opened).

---

## Installation (Developer Mode)

1. Clone or download this repository.
2. Open Firefox and go to `about:debugging`.
3. Click **"This Firefox"** → **"Load Temporary Add-on…"**
4. Select the `manifest.json` file in this directory.
5. Visit `https://github.com/settings/copilot/features` once to populate the
   initial data.
6. Click the extension icon in the toolbar to see your usage.

---

## File Structure

```
firefox-addon-github-copilot-monitor/
├── manifest.json       Extension manifest (MV2)
├── background.js       Event-page background script
├── content.js          Content script (reads usage from GitHub DOM)
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
| `https://github.com/settings/copilot/features*` | Read content from the settings page |
