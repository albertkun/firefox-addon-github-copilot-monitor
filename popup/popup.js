/**
 * popup.js — controls the popup UI
 *
 * Reads cached usage data from browser.storage.local and renders:
 *  • A battery-style progress bar
 *  • Numeric percentage (supports decimals, e.g. "12.3%")
 *  • Remaining percentage label
 *  • Countdown in days until the monthly reset
 *  • Verbatim reset info from GitHub (if available)
 *  • Last-updated timestamp
 *
 * Also listens for storage changes so the display updates live while the
 * user has the GitHub settings page open alongside the popup.
 */

"use strict";

const STORAGE_KEY    = "copilotUsage";
const SETTINGS_URL   = "https://github.com/settings/copilot/features";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const batteryFill       = document.getElementById("battery-fill");
const pctLabel          = document.getElementById("pct-label");
const remainingLabel    = document.getElementById("remaining-label");
const resetCountdownEl  = document.getElementById("reset-countdown");
const resetInfo         = document.getElementById("reset-info");
const updatedAtEl       = document.getElementById("updated-at");
const usageSection      = document.getElementById("usage-section");
const noDataSection     = document.getElementById("no-data");
const openSettingsBtn   = document.getElementById("open-settings");

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

/** Format a percentage with up to 1 decimal place (trims trailing .0). */
function formatPct(n) {
  const clamped = Math.min(100, Math.max(0, n));
  // Round to 1 decimal first
  const rounded = Math.round(clamped * 10) / 10;
  return (Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1)) + "%";
}

/**
 * Compute the first day of next month (local time). Inlined here so the
 * popup does not need to load the extractor module.
 */
function nextResetDate(now) {
  const d = now || new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

/** Days until `resetDate` from today (calendar-day math, DST-safe). */
function daysUntil(resetDate, now) {
  const today = now || new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfReset = new Date(resetDate.getFullYear(), resetDate.getMonth(), resetDate.getDate()).getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((startOfReset - startOfToday) / MS_PER_DAY));
}

/** Format the reset countdown string for the popup. */
function formatResetCountdown(resetMs) {
  const now = new Date();
  const resetDate = resetMs
    ? new Date(resetMs)
    : nextResetDate(now);
  const days = daysUntil(resetDate, now);
  const monthDay = resetDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  let phrase;
  if (days === 0)      phrase = "Resets today";
  else if (days === 1) phrase = "Resets tomorrow";
  else                 phrase = `Resets in ${days} days`;

  return `${phrase} (${monthDay})`;
}

/** Render data or the no-data state. */
function render(data) {
  if (!data || typeof data.used !== "number" || isNaN(data.used)) {
    usageSection.classList.add("hidden");
    noDataSection.classList.remove("hidden");
    return;
  }

  const pct       = Math.min(100, Math.max(0, data.used));
  const remaining = Math.max(0, 100 - pct);

  // Show usage section, hide no-data
  usageSection.classList.remove("hidden");
  noDataSection.classList.add("hidden");

  // Battery bar
  batteryFill.style.width = `${pct}%`;
  batteryFill.className   = `battery-fill ${colorClass(pct)}`;

  // Labels
  pctLabel.textContent       = formatPct(pct);
  pctLabel.style.color       = getComputedStyle(batteryFill).backgroundColor;
  remainingLabel.textContent = `${formatPct(remaining)} remaining`;

  // Reset countdown (always show — computed locally if not stored)
  resetCountdownEl.textContent = formatResetCountdown(data.resetAt);
  resetCountdownEl.classList.remove("hidden");

  // Verbatim reset phrase (optional)
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
  // Also kick off a silent background refresh so the popup reflects fresh
  // data even if the user doesn't have the settings tab open. We don't
  // await — the storage.onChanged listener below will pick up the result.
  browser.runtime.sendMessage({ type: "refreshUsage" }).catch(() => { /* best-effort */ });
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
