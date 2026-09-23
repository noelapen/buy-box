/**
 * background.js — Chrome Extension Service Worker (Manifest V3)
 *
 * Listens for cart detection messages from the content script and
 * opens the side panel on the relevant tab. Also handles extension
 * icon clicks to manually open the side panel.
 */

const CART_ITEM_KEY = 'blackBoxCartItem';

// Listen for cart detection events from the content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== 'BLACK_BOX_CART_DETECTED' || !message.title) return;

  // Store the detected product title for the side panel to pick up
  chrome.storage.local.set({ [CART_ITEM_KEY]: message.title });

  // Automatically open the side panel on the tab where cart was detected
  if (sender.tab?.id !== undefined) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
  }
});

// Open the side panel when the extension icon is clicked
chrome.action.onClicked.addListener(tab => {
  if (tab.id !== undefined) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  }
});
