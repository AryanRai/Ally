const dot = document.getElementById('dot');
const label = document.getElementById('label');
const btn = document.getElementById('btn');

function updateUI(connected, wsState) {
  if (connected) {
    dot.className = 'dot connected';
    label.textContent = 'Connected to Ally';
  } else if (wsState === 0) { // CONNECTING
    dot.className = 'dot connecting';
    label.textContent = 'Connecting...';
  } else {
    dot.className = 'dot disconnected';
    label.textContent = 'Not connected';
  }
}

// Get current status
chrome.runtime.sendMessage({ type: 'get_status' }, (res) => {
  if (res) updateUI(res.connected, res.wsState);
});

// Listen for status updates while popup is open
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status') updateUI(msg.connected, -1);
});

btn.addEventListener('click', () => {
  dot.className = 'dot connecting';
  label.textContent = 'Reconnecting...';
  chrome.runtime.sendMessage({ type: 'reconnect' });
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'get_status' }, (res) => {
      if (res) updateUI(res.connected, res.wsState);
    });
  }, 2000);
});
