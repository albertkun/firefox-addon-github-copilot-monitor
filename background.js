/**
 * background.js — event-page background script
 *
 * Responsibilities:
 *  • Set up the periodic refresh alarm on install/update.
 *  • Listen for messages from the content script (future use / explicit refresh).
 *  • When the alarm fires, reload any already-open copilot settings tabs so the
 *    content script can refresh stored usage data.
 */

"use strict";

const STORAGE_KEY   = "copilotUsage";
const SETTINGS_URL  = "https://github.com/settings/copilot/features";
const ALARM_NAME    = "copilot-usage-refresh";
const ALARM_PERIOD  = 60; // minutes

// Badge colour gradient thresholds and channel maximums
const BADGE_MID_THRESHOLD = 50;   // usage % at which red channel peaks / green starts to fall
const BADGE_MAX_RED       = 255;  // maximum red channel value
const BADGE_MAX_GREEN     = 180;  // maximum green channel value (kept below 255 for warmth)

// ── On install / update: set up the periodic alarm
browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.5,
    periodInMinutes: ALARM_PERIOD,
  });
});

// ── Alarm fires → open settings tab silently to refresh data.
//    We reuse an existing background tab if one is already open.
browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const tabs = await browser.tabs.query({ url: `${SETTINGS_URL}*` });
  if (tabs.length > 0) {
    // Settings page is already open — reload it to trigger the content script
    for (const tab of tabs) {
      browser.tabs.reload(tab.id);
    }
  }
  // If not open we just skip — the user will see stale data until they visit
  // the settings page or click "Open settings" in the popup.
});

// ── Message relay: content script can send a "usageUpdated" message
//    (reserved for future use — e.g. to badge the toolbar icon).
browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "usageUpdated") {
    updateBadge(message.used);
  }
});

/** Update the toolbar badge with the current usage percentage. */
function updateBadge(usedPct) {
  if (usedPct === undefined || usedPct === null || !Number.isFinite(usedPct)) {
    browser.browserAction.setBadgeText({ text: "" });
    return;
  }
  const clampedUsedPct = Math.min(100, Math.max(0, usedPct));
  const text = clampedUsedPct + "%";
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
