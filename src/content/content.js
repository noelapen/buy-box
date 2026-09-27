/* content.js — Lightweight cart detection content script.
 * Uses event delegation + debounced observer instead of scanning every DOM node. */

import { getCartProductTitles, getProductTitle, isCartRelatedPage } from './cartDetection.js';

const CART_KEYWORDS = /add\s*to\s*(cart|bag|basket)|addtocart|addtobag|addtobasket/i;
const IGNORE_KEYWORDS = /go to cart|view cart|checkout|proceed to buy|buy now|place order|pay now|continue shopping/i;

let lastTitle = '';
let buyBoxFrame = null;
let debounceTimer = null;

// ── Popup management ────────────────────────────────────────

function closeBuyBox() { buyBoxFrame?.remove(); buyBoxFrame = null; }

function openBuyBox(title) {
  closeBuyBox();
  buyBoxFrame = document.createElement('iframe');
  buyBoxFrame.title = 'BUY BOX shopping comparison';
  buyBoxFrame.src = chrome.runtime.getURL('sidepanel.html');
  buyBoxFrame.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:min(94vw,560px);height:min(82vh,720px);border:0;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.48);background:#07120d;';
  buyBoxFrame.addEventListener('load', () => {
    buyBoxFrame?.contentWindow?.postMessage({ type: 'BUY_BOX_QUERY', query: title }, '*');
  }, { once: true });
  document.documentElement.appendChild(buyBoxFrame);
}

window.addEventListener('message', e => {
  if (e.source !== buyBoxFrame?.contentWindow) return;
  if (e.data?.type === 'BUY_BOX_CLOSE') closeBuyBox();
  if (e.data?.type === 'BUY_BOX_MINIMIZE' && buyBoxFrame) {
    const min = buyBoxFrame.style.height === '78px';
    buyBoxFrame.style.height = min ? 'min(82vh, 720px)' : '78px';
  }
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type !== 'BUY_BOX_OPEN') return;
  const title = lastTitle || getProductTitle(document);
  if (title) { lastTitle = title; openBuyBox(title); }
});

// ── Cart detection via event delegation (no querySelectorAll spam) ─

function isCartButton(el) {
  if (!el) return false;
  const text = (el.textContent || '').trim().toLowerCase();
  const id = (el.id || '').toLowerCase();
  const cls = (el.className || '').toString().toLowerCase();
  const aria = (el.getAttribute?.('aria-label') || '').toLowerCase();
  const combined = `${text} ${id} ${cls} ${aria}`;

  if (IGNORE_KEYWORDS.test(combined)) return false;
  return CART_KEYWORDS.test(combined);
}

// Single click listener on document — no need to bind every button
document.addEventListener('click', e => {
  // Walk up from click target to find the action element
  const el = e.target?.closest?.('button, input[type="submit"], input[type="button"], a') || e.target;
  if (!el || !isCartButton(el)) return;

  const title = getProductTitle(document);
  if (!title || title === lastTitle) return;

  lastTitle = title;
  chrome.runtime.sendMessage({ type: 'BUY_BOX_CART_DETECTED', title });
  openBuyBox(title);
}, { capture: true });

// ── Cart page scanning (debounced, idle-scheduled) ──────────

function debouncedCartScan() {
  if (debounceTimer) return; // Already scheduled
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    // Use requestIdleCallback if available, otherwise just run
    const run = () => {
      if (!isCartRelatedPage(document)) return;
      const titles = getCartProductTitles(document);
      const title = titles.find(t => t !== lastTitle);
      if (!title) return;
      lastTitle = title;
      chrome.runtime.sendMessage({ type: 'BUY_BOX_CART_DETECTED', title });
      openBuyBox(title);
    };
    typeof requestIdleCallback === 'function' ? requestIdleCallback(run) : run();
  }, 800); // 800ms debounce — Amazon DOM settles after initial load
}

// Single observer, debounced — only for cart pages
if (isCartRelatedPage(document)) {
  new MutationObserver(debouncedCartScan).observe(document.documentElement, {
    childList: true, subtree: true,
  });
  debouncedCartScan();
}
