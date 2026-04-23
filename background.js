/**
 * background.js — event-page background script
 *
 * Responsibilities:
 *  • Inject the content script into already-open copilot settings tabs on install.
 *  • Listen for messages from the content script (future use / explicit refresh).
 *  • Provide an alarm-based periodic refresh so the popup always has recent data
 *    even without the user visiting the settings page.
 */

"use strict";

const SETTINGS_URL = "https://github.com/settings/copilot/features";
const ALARM_NAME   = "copilot-usage-refresh";
const ALARM_PERIOD = 60; // minutes

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

  const tabs = await browser.tabs.query({ url: SETTINGS_URL });
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
  if (usedPct === undefined || usedPct === null) {
    browser.browserAction.setBadgeText({ text: "" });
    return;
  }
  const text = usedPct + "%";
  browser.browserAction.setBadgeText({ text });
  // Color shifts from green → amber → red as usage rises
  const r = usedPct >= 50 ? 255 : Math.round((usedPct / 50) * 255);
  const g = usedPct <= 50 ? 180 : Math.round(((100 - usedPct) / 50) * 180);
  browser.browserAction.setBadgeBackgroundColor({ color: [r, g, 0, 255] });
}

// ── Restore badge on browser startup from stored data
browser.storage.local.get("copilotUsage").then((data) => {
  if (data.copilotUsage) {
    updateBadge(data.copilotUsage.used);
  }
});
