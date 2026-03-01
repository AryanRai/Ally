/**
 * Register Discord Slash Commands
 *
 * Run this once after creating your Discord application:
 *   node scripts/register-discord-commands.js
 *
 * Requires: DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID in .env.local
 */

require('dotenv').config({ path: '.env.local' });

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
  console.error('❌ Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID in .env.local');
  process.exit(1);
}

const commands = [
  {
    name: 'link',
    description: 'Link your Discord account to your Ally AI assistant',
    type: 1,
  },
  {
    name: 'chat',
    description: 'Send a message to your Ally AI assistant',
    type: 1,
    options: [
      {
        name: 'message',
        description: 'The message to send to Ally',
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: 'status',
    description: 'Check the status of your connected Ally systems',
    type: 1,
  },
  {
    name: 'unlink',
    description: 'Disconnect your Discord from your Ally account',
    type: 1,
  },
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

  console.log('📡 Registering Discord slash commands...\n');

  for (const command of commands) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(command),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ /${command.name} — registered (id: ${data.id})`);
    } else {
      const err = await res.text();
      console.error(`  ❌ /${command.name} — failed: ${err}`);
    }
  }

  console.log('\n✨ Done. Set your Interactions Endpoint URL to:');
  console.log(`   https://your-domain.vercel.app/api/discord`);
}

registerCommands().catch(console.error);
