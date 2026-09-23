/**
 * background.js — Chrome Extension Service Worker (Manifest V3)
 *
 * Listens for cart detection messages from the content script and
 * stores the detected item so the content script can open the BUY BOX popup.
 */

const CART_ITEM_KEY = 'buyBoxCartItem';

// Listen for cart detection events from the content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== 'BUY_BOX_CART_DETECTED' || !message.title) return;

  // Store the detected product title for the side panel to pick up
  chrome.storage.local.set({ [CART_ITEM_KEY]: message.title });

});

chrome.action.onClicked.addListener(tab => {
  if (tab.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: 'BUY_BOX_OPEN' }).catch(() => undefined);
  }
});
