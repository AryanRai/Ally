/**
 * Discord Interactions Webhook Endpoint
 *
 * Handles Discord slash commands and interactions via webhook.
 * No discord.js needed — works on Vercel serverless.
 *
 * Discord sends interactions here. We verify the signature,
 * then handle /link (pair Discord to Ally) and /chat (send message).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

// Discord interaction types
const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
} as const;

const INTERACTION_RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE: 4,
  DEFERRED_CHANNEL_MESSAGE: 5,
} as const;

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

/**
 * Verify Discord request signature using Web Crypto API (Edge-compatible)
 */
async function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return false;

  try {
    const encoder = new TextEncoder();
    const keyBytes = hexToUint8Array(publicKey);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );
    const message = encoder.encode(timestamp + body);
    const sig = hexToUint8Array(signature);
    return await crypto.subtle.verify('Ed25519', key, sig.buffer as ArrayBuffer, message);
  } catch {
    // Fallback: if Ed25519 not supported, try tweetnacl-style
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('x-signature-ed25519') || '';
  const timestamp = req.headers.get('x-signature-timestamp') || '';

  // Verify signature (Discord requires this)
  const isValid = await verifyDiscordSignature(body, signature, timestamp);
  if (!isValid) {
    // In dev, allow unverified for testing
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    console.warn('⚠️ Discord signature verification failed (dev mode, allowing)');
  }

  const interaction = JSON.parse(body);

  // Handle Discord PING (required for webhook URL verification)
  if (interaction.type === INTERACTION_TYPE.PING) {
    return NextResponse.json({ type: INTERACTION_RESPONSE_TYPE.PONG });
  }

  // Handle slash commands
  if (interaction.type === INTERACTION_TYPE.APPLICATION_COMMAND) {
    const { name, options } = interaction.data;
    const discordUserId = interaction.member?.user?.id || interaction.user?.id;
    const discordUsername =
      interaction.member?.user?.username || interaction.user?.username;

    switch (name) {
      case 'link':
        return handleLinkCommand(discordUserId, discordUsername, interaction);
      case 'chat':
        return handleChatCommand(
          discordUserId,
          discordUsername,
          options,
          interaction
        );
      case 'status':
        return handleStatusCommand(discordUserId);
      case 'unlink':
        return handleUnlinkCommand(discordUserId);
      default:
        return NextResponse.json({
          type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
          data: { content: `Unknown command: /${name}` },
        });
    }
  }

  return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
}


// ─── Command Handlers ───────────────────────────────────────────────

/**
 * /link — Generates a pairing URL so the Discord user can link their Ally account
 */
async function handleLinkCommand(
  discordUserId: string,
  discordUsername: string,
  interaction: any
) {
  const supabase = getServiceClient();

  // Check if already linked
  const { data: existing } = await supabase
    .from('discord_links')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .single();

  if (existing) {
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: {
        content: `✅ You're already linked to an Ally account. Use \`/chat\` to send messages or \`/unlink\` to disconnect.`,
        flags: 64, // Ephemeral
      },
    });
  }

  // Generate a link token for Discord pairing
  const crypto = await import('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min for Discord

  const { error } = await supabase.from('link_tokens').insert({
    id: uuid(),
    token,
    user_id: null, // Will be set when user authenticates
    system_id: 'discord',
    system_name: `Discord (${discordUsername})`,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('Failed to create Discord link token:', error);
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: { content: '❌ Failed to generate link. Try again later.', flags: 64 },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_DOMAIN}`
    : process.env.NEXTAUTH_URL || 'http://localhost:3000';

  const linkUrl = `${baseUrl}/pair/discord?token=${token}&discord_id=${discordUserId}&discord_name=${encodeURIComponent(discordUsername)}`;

  return NextResponse.json({
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
    data: {
      content: `🔗 **Link your Ally account**\n\nClick the link below to connect your Discord to Ally:\n${linkUrl}\n\n⏰ This link expires in 10 minutes.`,
      flags: 64, // Ephemeral — only the user sees this
    },
  });
}

/**
 * /chat <message> — Send a message to the user's linked Ally system
 */
async function handleChatCommand(
  discordUserId: string,
  discordUsername: string,
  options: any[],
  interaction: any
) {
  const supabase = getServiceClient();

  // Find the linked Ally user
  const { data: link } = await supabase
    .from('discord_links')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .single();

  if (!link) {
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: {
        content: '❌ Your Discord isn\'t linked to an Ally account yet. Use `/link` first.',
        flags: 64,
      },
    });
  }

  // Get the message content from options
  const messageContent = options?.find((o: any) => o.name === 'message')?.value;
  if (!messageContent) {
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: { content: '❌ Please provide a message. Usage: `/chat message:Hello Ally`', flags: 64 },
    });
  }

  // Find an active local system for this user
  const { data: systems } = await supabase
    .from('local_systems')
    .select('*')
    .eq('user_id', link.user_id)
    .order('last_heartbeat', { ascending: false });

  const now = new Date();
  const activeSystems = (systems || []).filter((s: any) => {
    const diff = now.getTime() - new Date(s.last_heartbeat).getTime();
    return diff < 60000;
  });

  if (activeSystems.length === 0) {
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: {
        content: '⚠️ No active Ally system found. Make sure your desktop Ally is running.',
        flags: 64,
      },
    });
  }

  const targetSystem = activeSystems[0];

  // Create the message in Supabase
  const messageId = uuid();
  const sessionId = `discord_${discordUserId}_${new Date().toISOString().split('T')[0]}`;

  // Ensure session exists
  await supabase.from('chat_sessions').upsert(
    {
      id: sessionId,
      user_id: link.user_id,
      title: `Discord - ${discordUsername}`,
      metadata: { created_by: 'discord', discord_user_id: discordUserId },
      is_remote: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  // Insert the message
  const { error } = await supabase.from('chat_messages').insert({
    id: messageId,
    session_id: sessionId,
    user_id: link.user_id,
    content: messageContent,
    response: '',
    status: 'pending',
    source: 'discord',
    metadata: {
      discord_user_id: discordUserId,
      discord_username: discordUsername,
      discord_interaction_id: interaction.id,
      discord_channel_id: interaction.channel_id,
      discord_token: interaction.token, // For follow-up responses
    },
    is_remote: true,
    local_system_id: targetSystem.id,
  });

  if (error) {
    console.error('Failed to create Discord message:', error);
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: { content: '❌ Failed to send message. Try again.', flags: 64 },
    });
  }

  // Respond with deferred message — the local system will process and we'll follow up
  return NextResponse.json({
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
    data: {
      content: `📨 Message sent to **${targetSystem.name}**: "${messageContent}"\n\n⏳ Waiting for response...`,
    },
  });
}

/**
 * /status — Check if the user's Ally system is online
 */
async function handleStatusCommand(discordUserId: string) {
  const supabase = getServiceClient();

  const { data: link } = await supabase
    .from('discord_links')
    .select('*')
    .eq('discord_user_id', discordUserId)
    .single();

  if (!link) {
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: {
        content: '❌ Not linked. Use `/link` to connect your Discord to Ally.',
        flags: 64,
      },
    });
  }

  const { data: systems } = await supabase
    .from('local_systems')
    .select('*')
    .eq('user_id', link.user_id)
    .order('last_heartbeat', { ascending: false });

  if (!systems || systems.length === 0) {
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: { content: '📊 No Ally systems registered.', flags: 64 },
    });
  }

  const now = new Date();
  const statusLines = systems.map((s: any) => {
    const diff = now.getTime() - new Date(s.last_heartbeat).getTime();
    const isOnline = diff < 60000;
    const emoji = isOnline ? '🟢' : '🔴';
    const ago = isOnline
      ? `${Math.round(diff / 1000)}s ago`
      : `${Math.round(diff / 60000)}m ago`;
    return `${emoji} **${s.name}** — ${isOnline ? 'Online' : 'Offline'} (last seen ${ago})`;
  });

  return NextResponse.json({
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
    data: {
      content: `📊 **Ally Systems**\n\n${statusLines.join('\n')}`,
      flags: 64,
    },
  });
}

/**
 * /unlink — Disconnect Discord from Ally account
 */
async function handleUnlinkCommand(discordUserId: string) {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from('discord_links')
    .delete()
    .eq('discord_user_id', discordUserId);

  if (error) {
    return NextResponse.json({
      type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
      data: { content: '❌ Failed to unlink. Try again.', flags: 64 },
    });
  }

  return NextResponse.json({
    type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE,
    data: {
      content: '✅ Discord unlinked from Ally. Use `/link` to reconnect anytime.',
      flags: 64,
    },
  });
}
