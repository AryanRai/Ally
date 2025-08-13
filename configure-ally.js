#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get droplet IP from command line argument
const dropletIP = process.argv[2];

if (!dropletIP) {
  console.log('Usage: node configure-ally.js <DROPLET_IP>');
  console.log('Example: node configure-ally.js 164.90.123.456');
  process.exit(1);
}

console.log(`Configuring Ally Remote Dashboard with droplet IP: ${dropletIP}`);

// Update .env.local
const envPath = path.join(__dirname, '.env.local');
let envContent = fs.readFileSync(envPath, 'utf8');
envContent = envContent.replace(
  'http://YOUR_DROPLET_IP:3001',
  `http://${dropletIP}:3001`
);
fs.writeFileSync(envPath, envContent);
console.log('✅ Updated .env.local');

// Update ally-socket.ts
const socketPath = path.join(__dirname, 'lib', 'ally-socket.ts');
let socketContent = fs.readFileSync(socketPath, 'utf8');
socketContent = socketContent.replace(
  'http://localhost:3001',
  `http://${dropletIP}:3001`
);
fs.writeFileSync(socketPath, socketContent);
console.log('✅ Updated lib/ally-socket.ts');

console.log('\n🎉 Configuration complete!');
console.log('\nNext steps:');
console.log('1. Install dependencies: npm install');
console.log('2. Start the web dashboard: npm run dev');
console.log('3. Visit http://localhost:3000 to access the Ally Remote Dashboard');
console.log(`4. Your middleware server is running at: http://${dropletIP}:3001`);
console.log('\n📱 Usage:');
console.log('- Start your Glass PiP Chat with remote enabled');
console.log('- It will appear in the "Connected Allies" sidebar');
console.log('- Click on it to start remote control');
console.log('- Send messages from the web dashboard to your desktop app!');