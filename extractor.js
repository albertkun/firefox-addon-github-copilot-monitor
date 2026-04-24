/**
 * extractor.js — shared usage-extraction logic
 *
 * Used by both content.js (live DOM) and background.js (parsed HTML
 * fetched in the background with the user's session cookies).
 *
 * Exposes functions on `globalThis` so that it works as a plain script
 * in content_scripts and as a background script in MV2.
 */

"use strict";

(function (root) {
  /**
   * Regex matching a percentage (integer or decimal), e.g. "12", "12.3", "100".
   * Stored as a string so we can reuse it in multiple places.
   */
  const PCT_RE = /(\d{1,3}(?:\.\d+)?)\s*%/;

  /**
   * Extract the Premium-requests usage percentage from a document.
   *
   * Accepts either `document` (content script) or a DOMParser-produced
   * HTMLDocument (background fetch). Avoids APIs that require layout
   * (like `innerText`) so both work identically.
   *
   * @param {Document} doc
   * @returns {{ used: number }|null} Usage as a float with up to 1 decimal.
   */
  function extractUsageFromDoc(doc) {
    if (!doc || !doc.body) return null;

    // ── Strategy 1: <meter> / <progress> with a "premium" label.
    for (const el of doc.querySelectorAll("meter, progress")) {
      const label = getAccessibleLabel(doc, el).toLowerCase();
      const value = parseFloat(el.getAttribute("value") ?? "");
      const max   = parseFloat(el.getAttribute("max")   ?? "100");
      if (label.includes("premium") && !isNaN(value)) {
        return { used: roundPct((value / (max || 100)) * 100) };
      }
    }

    // ── Strategy 2: aria progressbar.
    for (const el of doc.querySelectorAll('[role="progressbar"]')) {
      const label = getAccessibleLabel(doc, el).toLowerCase();
      const now   = el.getAttribute("aria-valuenow");
      const max   = el.getAttribute("aria-valuemax") || "100";
      if (label.includes("premium") && now !== null) {
        const nowValue = parseFloat(now);
        const maxValue = parseFloat(max);
        if (Number.isFinite(nowValue) && Number.isFinite(maxValue) && maxValue > 0) {
          return { used: roundPct(clamp((nowValue / maxValue) * 100, 0, 100)) };
        }
      }
    }

    // ── Strategy 3: walk text nodes containing "premium requests" and look
    //    for an adjacent percentage in a nearby ancestor block.
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (/premium\s+requests/i.test(text)) {
        let container = node.parentElement;
        for (let i = 0; i < 4 && container; i++) {
          const blockText = getBlockText(container);
          const pct = extractPercentage(blockText);
          if (pct !== null) {
            return { used: pct };
          }
          container = container.parentElement;
        }
      }
    }

    // ── Strategy 4: broad full-page text scan as last resort.
    const bodyText = getBlockText(doc.body);
    const m = bodyText.match(new RegExp("premium\\s+requests[\\s\\S]{0,300}?" + PCT_RE.source, "i"));
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) return { used: roundPct(clamp(n, 0, 100)) };
    }

    return null;
  }

  /** Extract the reset-date phrase if present. */
  function extractResetInfoFromDoc(doc) {
    if (!doc || !doc.body) return null;
    const bodyText = getBlockText(doc.body);
    const m = bodyText.match(/reset\s+(?:at|on)[^.]{0,80}\./i);
    return m ? m[0].trim() : null;
  }

  /**
   * Return the first percentage (0–100, may be decimal) found in a string, or null.
   */
  function extractPercentage(text) {
    const m = text.match(PCT_RE);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return roundPct(n);
  }

  /** Round to at most 1 decimal place. */
  function roundPct(n) {
    return Math.round(n * 10) / 10;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * Get the visible-ish text of an element. We avoid `innerText` (which
   * requires layout and is unavailable in DOMParser-produced documents)
   * and use `textContent` with whitespace collapsed.
   */
  function getBlockText(el) {
    const raw = el.textContent || "";
    return raw.replace(/\s+/g, " ").trim();
  }

  /** Best-effort accessible label for an element. */
  function getAccessibleLabel(doc, el) {
    if (el.hasAttribute("aria-label")) return el.getAttribute("aria-label");

    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map((id) => {
        const ref = doc.getElementById(id);
        return ref ? ref.textContent : "";
      });
      return parts.join(" ");
    }

    let cur = el.parentElement;
    for (let i = 0; i < 5 && cur; i++) {
      const heading = cur.querySelector(
        "h1,h2,h3,h4,h5,h6,label,[class*=heading],[class*=title]"
      );
      if (heading) return heading.textContent;
      cur = cur.parentElement;
    }
    return "";
  }

  /**
   * Compute the next reset timestamp (ms since epoch).
   *
   * GitHub Copilot premium requests reset at the start of the next
   * calendar month. We use local time so the display matches what the
   * user sees on their own calendar.
   */
  function computeNextResetMs(nowMs) {
    const now = new Date(nowMs ?? Date.now());
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return next.getTime();
  }

  /**
   * Days until the given reset timestamp, from `nowMs`. Always returns
   * an integer ≥ 0. Uses calendar-day math (not raw ms / 86400000) so
   * DST boundaries don't shift the count by a day.
   */
  function daysUntilReset(resetMs, nowMs) {
    const now = new Date(nowMs ?? Date.now());
    const reset = new Date(resetMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfReset = new Date(reset.getFullYear(), reset.getMonth(), reset.getDate()).getTime();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return Math.max(0, Math.round((startOfReset - startOfToday) / MS_PER_DAY));
  }

  // Expose
  root.CopilotUsageExtractor = {
    extractUsageFromDoc,
    extractResetInfoFromDoc,
    computeNextResetMs,
    daysUntilReset,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
