/**
 * Ally Browser Bridge — Content Script
 * Minimal — most DOM work is done via chrome.scripting.executeScript from background.
 * This script handles cases where we need persistent page-level state.
 */

// Signal to background that this page is ready
chrome.runtime.sendMessage({ type: 'page_ready', url: location.href, title: document.title });

// Listen for direct messages from background if needed
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ alive: true, url: location.href });
  }
});
