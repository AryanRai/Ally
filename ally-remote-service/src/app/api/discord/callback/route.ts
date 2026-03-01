/**
 * Discord Callback API
 *
 * Called by the local Ally system after processing a Discord-sourced message.
 * Sends the response back to the Discord channel via webhook follow-up.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message_id, response, discord_interaction_token, discord_application_id } = body;

    if (!response || !discord_interaction_token) {
      return NextResponse.json(
        { error: 'response and discord_interaction_token required' },
        { status: 400 }
      );
    }

    const appId = discord_application_id || process.env.DISCORD_APPLICATION_ID;
    if (!appId) {
      return NextResponse.json(
        { error: 'Discord application ID not configured' },
        { status: 500 }
      );
    }

    // Send follow-up message to Discord via webhook
    // Discord interaction tokens are valid for 15 minutes
    const webhookUrl = `https://discord.com/api/v10/webhooks/${appId}/${discord_interaction_token}`;

    // Truncate response if too long for Discord (2000 char limit)
    let content = response;
    if (content.length > 1950) {
      content = content.substring(0, 1950) + '\n\n... (truncated)';
    }

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      console.error('Discord webhook failed:', discordRes.status, errText);
      return NextResponse.json(
        { error: 'Failed to send Discord response', details: errText },
        { status: 502 }
      );
    }

    return NextResponse.json({ status: 'sent', message_id });
  } catch (error) {
    console.error('Discord callback error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
