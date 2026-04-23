/**
 * popup.js — controls the popup UI
 *
 * Reads cached usage data from browser.storage.local and renders:
 *  • A battery-style progress bar
 *  • Numeric percentage
 *  • Remaining percentage label
 *  • Last-updated timestamp
 *  • Reset info (if available)
 *
 * Also listens for storage changes so the display updates live while the
 * user has the GitHub settings page open alongside the popup.
 */

"use strict";

const STORAGE_KEY    = "copilotUsage";
const SETTINGS_URL   = "https://github.com/settings/copilot/features";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const batteryFill    = document.getElementById("battery-fill");
const pctLabel       = document.getElementById("pct-label");
const remainingLabel = document.getElementById("remaining-label");
const resetInfo      = document.getElementById("reset-info");
const updatedAtEl    = document.getElementById("updated-at");
const usageSection   = document.getElementById("usage-section");
const noDataSection  = document.getElementById("no-data");
const openSettingsBtn = document.getElementById("open-settings");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Choose the CSS class for the battery fill based on usage percentage. */
function colorClass(pct) {
  if (pct >= 80) return "danger";
  if (pct >= 50) return "warn";
  return "ok";
}

/** Format a Unix timestamp (ms) as a human-readable "X ago" string. */
function timeAgo(ts) {
  const diffSec = Math.round((Date.now() - ts) / 1000);
  if (diffSec < 5)   return "just now";
  if (diffSec < 60)  return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  return `${Math.round(diffSec / 3600)}h ago`;
}

/** Render data or the no-data state. */
function render(data) {
  if (!data || typeof data.used !== "number" || isNaN(data.used)) {
    usageSection.classList.add("hidden");
    noDataSection.classList.remove("hidden");
    return;
  }

  const pct       = Math.min(100, Math.max(0, data.used));
  const remaining = 100 - pct;

  // Show usage section, hide no-data
  usageSection.classList.remove("hidden");
  noDataSection.classList.add("hidden");

  // Battery bar
  batteryFill.style.width = `${pct}%`;
  batteryFill.className   = `battery-fill ${colorClass(pct)}`;

  // Labels
  pctLabel.textContent       = `${pct}%`;
  pctLabel.style.color       = getComputedStyle(batteryFill).backgroundColor;
  remainingLabel.textContent = `${remaining}% remaining`;

  // Reset info
  if (data.resetInfo) {
    resetInfo.textContent = data.resetInfo;
    resetInfo.classList.remove("hidden");
  } else {
    resetInfo.textContent = "";
    resetInfo.classList.add("hidden");
  }

  // Last updated
  if (data.updatedAt) {
    updatedAtEl.textContent = `Updated ${timeAgo(data.updatedAt)}`;
  }
}

// ── Load data on popup open ───────────────────────────────────────────────────
browser.storage.local.get(STORAGE_KEY).then((result) => {
  render(result[STORAGE_KEY] || null);
}).catch((err) => {
  console.error("[Copilot Monitor] Failed to load usage from storage:", err);
  render(null);
});

// ── Live update if storage changes while popup is open ───────────────────────
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    render(changes[STORAGE_KEY].newValue || null);
  }
});

// ── "Open Settings & Refresh" button ────────────────────────────────────────
openSettingsBtn.addEventListener("click", (e) => {
  e.preventDefault();
  browser.tabs.query({ url: `${SETTINGS_URL}*` }).then((tabs) => {
    if (tabs.length > 0) {
      // Activate the existing tab and reload it
      browser.tabs.update(tabs[0].id, { active: true });
      browser.tabs.reload(tabs[0].id);
    } else {
      // Open a new tab
      browser.tabs.create({ url: SETTINGS_URL });
    }
    window.close();
  }).catch((err) => {
    console.error("[Copilot Monitor] Failed to open settings tab:", err);
  });
});
