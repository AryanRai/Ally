/**
 * Discord Response Delivery
 *
 * Cron job (runs every 10s via Vercel) that checks for completed Discord
 * messages and sends the response back via Discord's follow-up webhook.
 *
 * Discord interaction tokens are valid for 15 minutes, so we need to
 * deliver quickly after the desktop processes the message.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

const DISCORD_APP_ID = process.env.DISCORD_APPLICATION_ID!;

/** Send a follow-up message to Discord using the interaction token */
async function sendDiscordFollowUp(token: string, content: string): Promise<boolean> {
  // Truncate to Discord's 2000 char limit
  const truncated = content.length > 1900
    ? content.slice(0, 1900) + '\n\n*(response truncated)*'
    : content;

  // Strip markdown tool blocks that look ugly in Discord
  const cleaned = truncated
    .replace(/```tool_call[\s\S]*?```/g, '')
    .replace(/```tool_result[\s\S]*?```/g, '')
    .trim() || '*(no response)*';

  const url = `https://discord.com/api/v10/webhooks/${DISCORD_APP_ID}/${token}/messages/@original`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: cleaned }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Discord follow-up failed:', res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Discord follow-up error:', e);
    return false;
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();

  // Find completed Discord messages that haven't been delivered yet
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, response, status, metadata')
    .eq('source', 'discord')
    .in('status', ['completed', 'error'])
    .eq('discord_delivered', false)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('Failed to fetch Discord messages:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json({ delivered: 0 });
  }

  let delivered = 0;
  const ids: string[] = [];

  for (const msg of messages) {
    const token = msg.metadata?.discord_token;
    if (!token) {
      ids.push(msg.id); // Mark as delivered even if no token (can't do anything)
      continue;
    }

    const content = msg.status === 'error'
      ? `❌ Error processing your request: ${msg.response || 'Unknown error'}`
      : msg.response || '*(no response)*';

    const ok = await sendDiscordFollowUp(token, content);
    if (ok) delivered++;
    ids.push(msg.id);
  }

  // Mark all as delivered
  if (ids.length > 0) {
    await supabase
      .from('chat_messages')
      .update({ discord_delivered: true })
      .in('id', ids);
  }

  return NextResponse.json({ delivered, total: messages.length });
}

// Also allow POST for manual triggering
export const POST = GET;
