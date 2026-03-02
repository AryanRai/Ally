/**
 * Run with: node generate-icons.js
 * Generates simple PNG icons for the extension using Canvas API (Node.js)
 * Requires: npm install canvas
 */
const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#6366f1'; // indigo
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // Letter A
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.6}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('A', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

for (const size of [16, 48, 128]) {
  fs.writeFileSync(`icons/icon${size}.png`, makeIcon(size));
  console.log(`Generated icon${size}.png`);
}
