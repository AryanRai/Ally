#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get droplet IP from command line argument
const dropletIP = process.argv[2];

if (!dropletIP) {
  console.log('Usage: node configure-remote.js <DROPLET_IP>');
  console.log('Example: node configure-remote.js 164.90.123.456');
  process.exit(1);
}

console.log(`Configuring Glass PiP Chat with droplet IP: ${dropletIP}`);

// Update remote config
const configPath = path.join(__dirname, 'src', 'config', 'remote.ts');
let configContent = fs.readFileSync(configPath, 'utf8');
configContent = configContent.replace(
  'http://YOUR_DROPLET_IP:3001',
  `http://${dropletIP}:3001`
);
fs.writeFileSync(configPath, configContent);
console.log('✅ Updated src/config/remote.ts');

// Update AllyRemoteClient service
const servicePath = path.join(__dirname, 'src', 'services', 'allyRemoteClient.ts');
let serviceContent = fs.readFileSync(servicePath, 'utf8');
serviceContent = serviceContent.replace(
  'http://YOUR_DROPLET_IP:3001',
  `http://${dropletIP}:3001`
);
fs.writeFileSync(servicePath, serviceContent);
console.log('✅ Updated src/services/allyRemoteClient.ts');

console.log('\n🎉 Configuration complete!');
console.log('\nNext steps:');
console.log('1. Install dependencies: npm install');
console.log('2. Start the app: npm run dev');
console.log('3. Click the remote settings button (top-right) to connect');
console.log(`4. Your server is running at: http://${dropletIP}:3001`);