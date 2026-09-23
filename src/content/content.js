/**
 * content.js — Cart Detection Content Script
 *
 * Injected into supported shopping sites (Amazon, Flipkart, eBay, etc.)
 * to detect when a user clicks an "Add to Cart" button.
 */

import {
  getCartProductTitles,
  getProductTitle,
  isCartRelatedPage,
} from './cartDetection.js';

const CART_BUTTON_MATCHERS = [
  'button',
  'input[type="submit"]',
  'input[type="button"]',
  'a',
];

const IGNORED_BUTTON_LABELS = [
  'go to cart',
  'view cart',
  'checkout',
  'proceed to buy',
  'buy now',
  'subtotal',
  'continue shopping',
];

let lastTitle = '';
let buyBoxFrame = null;

function setPopupSize() {
  if (!buyBoxFrame) return;
  buyBoxFrame.style.height = buyBoxFrame.classList.contains('buy-box-popup--minimized')
    ? '78px'
    : 'min(82vh, 720px)';
}

function closeBuyBox() {
  buyBoxFrame?.remove();
  buyBoxFrame = null;
}

function openBuyBox(title) {
  closeBuyBox();
  buyBoxFrame = document.createElement('iframe');
  buyBoxFrame.title = 'BUY BOX shopping comparison';
  buyBoxFrame.src = chrome.runtime.getURL('sidepanel.html');
  buyBoxFrame.className = 'buy-box-popup';
  buyBoxFrame.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:min(94vw,560px);height:min(82vh,720px);border:0;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.48);background:#07120d;';
  buyBoxFrame.addEventListener('load', () => {
    buyBoxFrame?.contentWindow?.postMessage({ type: 'BUY_BOX_QUERY', query: title }, '*');
  }, { once: true });
  document.documentElement.appendChild(buyBoxFrame);
}

window.addEventListener('message', event => {
  if (event.source !== buyBoxFrame?.contentWindow) return;
  if (event.data?.type === 'BUY_BOX_CLOSE') closeBuyBox();
  if (event.data?.type === 'BUY_BOX_MINIMIZE') {
    buyBoxFrame?.classList.toggle('buy-box-popup--minimized');
    setPopupSize();
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message.type !== 'BUY_BOX_OPEN') return;
  const title = lastTitle || readTitle();
  if (!title) return;
  lastTitle = title;
  openBuyBox(title);
});

function getButtonText(button) {
  const text = [button?.textContent, button?.value, button?.getAttribute?.('aria-label')]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return text;
}

function getClosestActionElement(node) {
  if (!node) return null;

  const parent = typeof node.closest === 'function'
    ? node.closest('button, input, a')
    : null;

  return parent || (node.tagName && ['BUTTON', 'INPUT', 'A'].includes(node.tagName.toUpperCase()) ? node : null);
}

function matchesCartAction(button) {
  const actionElement = getClosestActionElement(button);
  if (!actionElement || !actionElement.tagName) return false;

  const label = getButtonText(actionElement);
  if (!label) return false;

  if (IGNORED_BUTTON_LABELS.some(item => label.includes(item))) return false;

  const id = (actionElement.id || '').toLowerCase();
  const name = (actionElement.name || '').toLowerCase();
  const className = (actionElement.className || '').toString().toLowerCase();
  const ariaLabel = (actionElement.getAttribute?.('aria-label') || '').toLowerCase();

  const signals = [
    id.includes('add-to-cart'),
    name.includes('add-to-cart'),
    className.includes('add-to-cart'),
    className.includes('addtocart'),
    ariaLabel.includes('add to cart'),
    label.includes('add to cart'),
    label.includes('addtocart'),
  ];

  return signals.some(Boolean);
}

function readTitle() {
  return getProductTitle(document);
}

function reportCart(event) {
  const button = getClosestActionElement(event?.target);
  if (!button || !matchesCartAction(button)) return;

  const title = readTitle();
  if (!title || title === lastTitle) return;

  lastTitle = title;
  chrome.runtime.sendMessage({ type: 'BUY_BOX_CART_DETECTED', title });
  openBuyBox(title);
}

function scanCartItems() {
  if (!isCartRelatedPage(document)) return;

  const titles = getCartProductTitles(document);
  const title = titles.find(item => item !== lastTitle);
  if (!title) return;

  lastTitle = title;
  chrome.runtime.sendMessage({ type: 'BUY_BOX_CART_DETECTED', title });
  openBuyBox(title);
}

function bindCartControls() {
  document.querySelectorAll(CART_BUTTON_MATCHERS.join(',')).forEach(button => {
    if (!matchesCartAction(button)) return;
    if (button.dataset.buyBoxBound) return;
    button.dataset.buyBoxBound = 'true';
    button.addEventListener('click', reportCart, { capture: true });
  });
}

new MutationObserver(bindCartControls).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

new MutationObserver(scanCartItems).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

bindCartControls();
scanCartItems();
