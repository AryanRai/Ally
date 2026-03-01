/**
 * Discord Link Completion API
 *
 * Called by the Discord pairing page after the user authenticates.
 * Creates the discord_links record and marks the link token as claimed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, discord_user_id, discord_username, user_id } = body;

    if (!token || !discord_user_id || !user_id) {
      return NextResponse.json(
        { error: 'token, discord_user_id, and user_id are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Verify the link token exists and is pending
    const { data: tokenData, error: tokenError } = await supabase
      .from('link_tokens')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 404 }
      );
    }

    // Check expiry
    if (new Date(tokenData.expires_at) < new Date()) {
      await supabase
        .from('link_tokens')
        .update({ status: 'expired' })
        .eq('token', token);
      return NextResponse.json({ error: 'Token expired' }, { status: 410 });
    }

    // Check if this Discord user is already linked
    const { data: existingLink } = await supabase
      .from('discord_links')
      .select('*')
      .eq('discord_user_id', discord_user_id)
      .single();

    if (existingLink) {
      // Update existing link to new user
      await supabase
        .from('discord_links')
        .update({
          user_id,
          discord_username: discord_username || existingLink.discord_username,
          linked_at: new Date().toISOString(),
        })
        .eq('discord_user_id', discord_user_id);
    } else {
      // Create new link
      const { error: linkError } = await supabase
        .from('discord_links')
        .insert({
          id: uuid(),
          user_id,
          discord_user_id,
          discord_username: discord_username || 'Unknown',
          linked_at: new Date().toISOString(),
        });

      if (linkError) {
        console.error('Failed to create discord link:', linkError);
        return NextResponse.json(
          { error: 'Failed to create link' },
          { status: 500 }
        );
      }
    }

    // Mark the token as claimed
    await supabase
      .from('link_tokens')
      .update({
        status: 'claimed',
        user_id,
        claimed_at: new Date().toISOString(),
      })
      .eq('token', token);

    return NextResponse.json({
      status: 'linked',
      discord_user_id,
      discord_username,
    });
  } catch (error) {
    console.error('Discord link error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
