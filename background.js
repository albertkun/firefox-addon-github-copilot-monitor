/**
 * background.js — event-page background script
 *
 * Responsibilities:
 *  • Set up the periodic refresh alarm on install/update.
 *  • When the alarm fires, refresh usage *silently in the background*
 *    by fetching the settings page with the user's existing session
 *    cookies and parsing the response — no tab needs to be open. If
 *    the fetch fails (e.g. user is signed out, network error), fall
 *    back to reloading any open settings tab.
 *  • Listen for "usageUpdated" messages from the content script so the
 *    toolbar badge stays in sync when the user visits the page directly.
 *  • Keep the toolbar badge in sync with storage.
 *
 * The shared extractor.js (listed before this file in manifest.json) is
 * loaded into this background script too, exposing `CopilotUsageExtractor`
 * on globalThis.
 */

"use strict";

const STORAGE_KEY   = "copilotUsage";
const SETTINGS_URL  = "https://github.com/settings/copilot/features";
const ALARM_NAME    = "copilot-usage-refresh";
const ALARM_PERIOD  = 30; // minutes — how often to silently refresh

// Badge colour gradient thresholds and channel maximums
const BADGE_MID_THRESHOLD = 50;   // usage % at which red channel peaks / green starts to fall
const BADGE_MAX_RED       = 255;  // maximum red channel value
const BADGE_MAX_GREEN     = 180;  // maximum green channel value (kept below 255 for warmth)

const {
  extractUsageFromDoc,
  extractResetInfoFromDoc,
  computeNextResetMs,
} = globalThis.CopilotUsageExtractor;

// ── On install / update: set up the periodic alarm and do an initial fetch.
browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.5,
    periodInMinutes: ALARM_PERIOD,
  });
  // Kick off an immediate silent refresh so the popup has data right away.
  refreshUsage().catch(() => { /* non-fatal */ });
});

// ── Alarm fires → silent background refresh.
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await refreshUsage();
});

// ── Message relay: content script informs us when usage updates.
browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "usageUpdated") {
    updateBadge(message.used);
  } else if (message && message.type === "refreshUsage") {
    // Popup can request an on-demand refresh.
    return refreshUsage();
  }
});

/**
 * Fetch the Copilot settings page silently using the user's existing
 * session cookies, parse the HTML, and save any extracted usage.
 *
 * No OAuth is required: browsers automatically include the user's
 * github.com cookies in same-origin requests made from the extension
 * when the host is listed in `permissions`. If the user is signed out
 * the fetch will redirect to a login page and extraction will simply
 * find no usage data — in which case we fall back to reloading an
 * already-open settings tab (if any).
 *
 * @returns {Promise<boolean>} true if usage was successfully extracted.
 */
async function refreshUsage() {
  try {
    const res = await fetch(SETTINGS_URL, {
      credentials: "include",
      redirect: "follow",
      cache: "no-cache",
      headers: { "Accept": "text/html" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Detect login redirect: final URL no longer on the settings page.
    if (!res.url.includes("/settings/copilot/features")) {
      throw new Error("redirected away from settings page (likely signed out)");
    }

    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, "text/html");
    const usage = extractUsageFromDoc(doc);
    if (!usage) throw new Error("usage not found in fetched page");

    const payload = {
      used: usage.used,
      updatedAt: Date.now(),
      resetInfo: extractResetInfoFromDoc(doc),
      resetAt: computeNextResetMs(),
      source: "background",
    };
    await browser.storage.local.set({ [STORAGE_KEY]: payload });
    updateBadge(usage.used);
    return true;
  } catch (err) {
    console.warn("[Copilot Monitor] Silent refresh failed, falling back:", err?.message ?? err);
    await fallbackReloadOpenTab();
    return false;
  }
}

/** If a settings tab is already open, reload it so the content script refreshes. */
async function fallbackReloadOpenTab() {
  try {
    const tabs = await browser.tabs.query({ url: `${SETTINGS_URL}*` });
    for (const tab of tabs) {
      browser.tabs.reload(tab.id);
    }
  } catch (err) {
    console.error("[Copilot Monitor] Failed to reload open settings tab:", err);
  }
}

/** Update the toolbar badge with the current usage percentage. */
function updateBadge(usedPct) {
  if (usedPct === undefined || usedPct === null || !Number.isFinite(usedPct)) {
    browser.browserAction.setBadgeText({ text: "" });
    return;
  }
  const clampedUsedPct = Math.min(100, Math.max(0, usedPct));
  // Badge has very little room — always show an integer percentage.
  const text = Math.round(clampedUsedPct) + "%";
  browser.browserAction.setBadgeText({ text });
  // Color shifts from green → amber → red as usage rises
  const r = clampedUsedPct >= BADGE_MID_THRESHOLD
    ? BADGE_MAX_RED
    : Math.round((clampedUsedPct / BADGE_MID_THRESHOLD) * BADGE_MAX_RED);
  const g = clampedUsedPct <= BADGE_MID_THRESHOLD
    ? BADGE_MAX_GREEN
    : Math.round(((100 - clampedUsedPct) / (100 - BADGE_MID_THRESHOLD)) * BADGE_MAX_GREEN);
  browser.browserAction.setBadgeBackgroundColor({ color: [r, g, 0, 255] });
}

// ── Restore badge on browser startup from stored data
browser.storage.local.get(STORAGE_KEY).then((data) => {
  if (data[STORAGE_KEY]) {
    updateBadge(data[STORAGE_KEY].used);
  }
}).catch((err) => {
  console.error("[Copilot Monitor] Failed to read stored usage on startup:", err);
});
