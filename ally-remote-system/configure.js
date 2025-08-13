#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get droplet IP from command line argument
const dropletIP = process.argv[2];

if (!dropletIP) {
  console.log('Usage: node configure.js <DROPLET_IP>');
  console.log('Example: node configure.js 164.90.123.456');
  process.exit(1);
}

console.log(`Configuring Ally Remote System with droplet IP: ${dropletIP}`);

// Update desktop client
const desktopClientPath = path.join(__dirname, 'desktop-client', 'index.js');
let desktopContent = fs.readFileSync(desktopClientPath, 'utf8');
desktopContent = desktopContent.replace(
  'http://YOUR_DROPLET_IP:3001',
  `http://${dropletIP}:3001`
);
fs.writeFileSync(desktopClientPath, desktopContent);
console.log('✅ Updated desktop-client/index.js');

// Update web dashboard
const webDashboardPath = path.join(__dirname, 'web-dashboard', '.env.local');
let webContent = fs.readFileSync(webDashboardPath, 'utf8');
webContent = webContent.replace(
  'http://YOUR_DROPLET_IP:3001',
  `http://${dropletIP}:3001`
);
fs.writeFileSync(webDashboardPath, webContent);
console.log('✅ Updated web-dashboard/.env.local');

console.log('\n🎉 Configuration complete!');
console.log('\nNext steps:');
console.log('1. Run desktop client: cd desktop-client && npm install && npm start');
console.log('2. Run web dashboard: cd web-dashboard && npm install && npm run dev');
console.log(`3. Your server is running at: http://${dropletIP}:3001`);