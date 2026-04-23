/**
 * content.js — runs on https://github.com/settings/copilot/features
 *
 * Reads the "Premium requests" usage percentage from the page DOM,
 * persists it to browser.storage.local, and optionally also stores
 * the reset date shown on the page.
 */

"use strict";

const STORAGE_KEY = "copilotUsage";
const RETRY_INTERVAL_MS = 1500;
const MAX_RETRIES = 10;

/**
 * Try to extract the premium-requests usage percentage from the current DOM.
 *
 * GitHub renders the settings page with server-side Rails + occasional React
 * hydration, so the data may arrive slightly after DOMContentLoaded.
 *
 * We try several strategies in order of preference:
 *  1. <meter> / <progress> elements near a "Premium requests" label.
 *  2. [aria-valuenow] progressbar roles near that label.
 *  3. Text pattern matching: "Premium requests … N%".
 *
 * @returns {{ used: number, total: number|null }|null}
 */
function extractUsage() {
  // ── Strategy 1: look for a <meter> or <progress> whose accessible label
  //    (aria-label, aria-labelledby, or preceding heading) mentions "premium".
  for (const el of document.querySelectorAll("meter, progress")) {
    const label = getAccessibleLabel(el).toLowerCase();
    const value = parseFloat(el.value ?? el.getAttribute("value") ?? "");
    const max   = parseFloat(el.max   ?? el.getAttribute("max")   ?? "100");
    if (label.includes("premium") && !isNaN(value)) {
      return { used: Math.round((value / (max || 100)) * 100), total: null };
    }
  }

  // ── Strategy 2: aria progressbar
  for (const el of document.querySelectorAll('[role="progressbar"]')) {
    const label = getAccessibleLabel(el).toLowerCase();
    const now   = el.getAttribute("aria-valuenow");
    const max   = el.getAttribute("aria-valuemax") || "100";
    if (label.includes("premium") && now !== null) {
      return { used: Math.round((parseFloat(now) / parseFloat(max)) * 100), total: null };
    }
  }

  // ── Strategy 3: Walk every element that contains "Premium requests" text
  //    and look for an adjacent percentage.
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (/premium\s+requests/i.test(text)) {
      // Search within the nearest block ancestor (up to 4 levels up)
      let container = node.parentElement;
      for (let i = 0; i < 4 && container; i++) {
        const pct = extractPercentage(container.innerText || container.textContent || "");
        if (pct !== null) {
          return { used: pct, total: null };
        }
        container = container.parentElement;
      }
    }
  }

  // ── Strategy 4: broad full-page text scan as last resort
  const bodyText = document.body.innerText || document.body.textContent || "";
  const match = bodyText.match(/premium\s+requests[\s\S]{0,300}?(\d{1,3})\s*%/i);
  if (match) {
    return { used: Math.min(100, parseInt(match[1], 10)), total: null };
  }

  return null;
}

/** Return the first N% found in a string (0-100), or null. */
function extractPercentage(text) {
  const m = text.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 0 && n <= 100 ? n : null;
}

/** Best-effort accessible label for an element. */
function getAccessibleLabel(el) {
  // aria-label
  if (el.hasAttribute("aria-label")) return el.getAttribute("aria-label");

  // aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(id => {
      const ref = document.getElementById(id);
      return ref ? ref.textContent : "";
    });
    return parts.join(" ");
  }

  // Walk up to find a preceding heading or label sibling
  let cur = el.parentElement;
  for (let i = 0; i < 5 && cur; i++) {
    const heading = cur.querySelector("h1,h2,h3,h4,h5,h6,label,[class*=heading],[class*=title]");
    if (heading) return heading.textContent;
    cur = cur.parentElement;
  }

  return "";
}

/** Extract the reset-date phrase if present (e.g. "reset at the start of next month"). */
function extractResetInfo() {
  const bodyText = document.body.innerText || "";
  const m = bodyText.match(/reset\s+(?:at|on)[^.]{0,80}\./i);
  return m ? m[0].trim() : null;
}

/** Persist usage data to extension storage. */
function saveUsage(usage) {
  const payload = {
    used: usage.used,
    updatedAt: Date.now(),
    resetInfo: extractResetInfo(),
  };
  browser.storage.local.set({ [STORAGE_KEY]: payload });
}

/** Attempt extraction; retry up to MAX_RETRIES times for dynamic pages. */
let retryCount = 0;
function tryExtract() {
  const usage = extractUsage();
  if (usage !== null) {
    saveUsage(usage);
    return;
  }
  if (retryCount < MAX_RETRIES) {
    retryCount++;
    setTimeout(tryExtract, RETRY_INTERVAL_MS);
  }
}

tryExtract();

// Also re-run whenever the DOM mutates significantly (GitHub SPA navigation)
const observer = new MutationObserver(() => {
  retryCount = 0;
  tryExtract();
});
observer.observe(document.body, { childList: true, subtree: true });
