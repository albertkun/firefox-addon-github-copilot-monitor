/**
 * content.js — runs on https://github.com/settings/copilot/features
 *
 * Reads the "Premium requests" usage percentage from the page DOM,
 * persists it to browser.storage.local along with the computed reset
 * timestamp so the popup can show days-until-reset.
 *
 * Extraction logic lives in extractor.js (shared with background.js
 * so the addon can also refresh in the background without an open tab).
 */

"use strict";

const STORAGE_KEY = "copilotUsage";
const RETRY_INTERVAL_MS = 1500;
const MAX_RETRIES = 10;

const {
  extractUsageFromDoc,
  extractResetInfoFromDoc,
  computeNextResetMs,
} = globalThis.CopilotUsageExtractor;

/** Persist usage data to extension storage. */
function saveUsage(usage) {
  const payload = {
    used: usage.used,
    updatedAt: Date.now(),
    resetInfo: extractResetInfoFromDoc(document),
    resetAt: computeNextResetMs(),
    source: "content",
  };
  return browser.storage.local.set({ [STORAGE_KEY]: payload }).then(() => {
    // Let the background page refresh the badge. Wrapped with .catch()
    // because sendMessage returns a rejected Promise when no receiver is
    // listening (e.g. background page is still spinning up).
    Promise.resolve(browser.runtime.sendMessage({ type: "usageUpdated", used: usage.used }))
      .catch(() => { /* best-effort */ });
  }).catch((err) => {
    console.error("[Copilot Monitor] Failed to persist usage data:", err);
  });
}

/** Attempt extraction; retry up to MAX_RETRIES times for dynamic pages. */
let retryCount = 0;
let retryPending = false; // guard against concurrent retry loops

function tryExtract() {
  retryPending = false;
  const usage = extractUsageFromDoc(document);
  if (usage !== null) {
    saveUsage(usage);
    return;
  }
  if (retryCount < MAX_RETRIES) {
    retryCount++;
    retryPending = true;
    setTimeout(tryExtract, RETRY_INTERVAL_MS);
  }
}

tryExtract();

// Also re-run whenever the DOM mutates significantly (GitHub SPA navigation).
// Only schedule a new extraction if one is not already pending.
const observer = new MutationObserver(() => {
  if (!retryPending) {
    retryCount = 0;
    tryExtract();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
