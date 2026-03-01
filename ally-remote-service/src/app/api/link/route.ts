/**
 * Link Token API - QR-based pairing
 * 
 * POST /api/link - Generate a new link token (called by desktop app)
 * GET /api/link?token=xxx - Check/claim a link token (called by phone after QR scan)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';
import crypto from 'crypto';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}

// POST - Desktop generates a link token
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, systemId, systemName } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    const { error } = await supabase.from('link_tokens').insert({
      id: uuid(),
      token,
      user_id: userId,
      system_id: systemId || 'default',
      system_name: systemName || 'Ally Desktop',
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    }).select().single();

    if (error) {
      console.error('Failed to create link token:', error);
      return NextResponse.json({ error: 'Failed to create token' }, { status: 500 });
    }

    // Build the QR URL - phone scans this to auto-connect
    const baseUrl = process.env.NEXT_PUBLIC_DOMAIN 
      ? `https://${process.env.NEXT_PUBLIC_DOMAIN}`
      : process.env.NEXTAUTH_URL || 'http://localhost:3000';
    
    const qrUrl = `${baseUrl}/pair?token=${token}`;

    return NextResponse.json({
      token,
      qrUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: 300,
    });
  } catch (error) {
    console.error('Link token error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET - Check token status or claim it
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Expire old tokens first
  await supabase.from('link_tokens')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  const { data, error } = await supabase.from('link_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  if (data.status === 'expired') {
    return NextResponse.json({ error: 'Token expired' }, { status: 410 });
  }

  if (data.status === 'claimed') {
    return NextResponse.json({ 
      status: 'claimed',
      userId: data.user_id,
      systemId: data.system_id,
      systemName: data.system_name,
    });
  }

  return NextResponse.json({
    status: 'pending',
    systemId: data.system_id,
    systemName: data.system_name,
    expiresAt: data.expires_at,
  });
}

// PUT - Claim a token (phone calls this after scanning QR)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Find the token
    const { data: tokenData, error: findError } = await supabase.from('link_tokens')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (findError || !tokenData) {
      return NextResponse.json({ error: 'Token not found or expired' }, { status: 404 });
    }

    // Check expiry
    if (new Date(tokenData.expires_at) < new Date()) {
      await supabase.from('link_tokens').update({ status: 'expired' }).eq('token', token);
      return NextResponse.json({ error: 'Token expired' }, { status: 410 });
    }

    // Mark as claimed
    await supabase.from('link_tokens')
      .update({ status: 'claimed', claimed_at: new Date().toISOString() })
      .eq('token', token);

    return NextResponse.json({
      status: 'claimed',
      userId: tokenData.user_id,
      systemId: tokenData.system_id,
      systemName: tokenData.system_name,
      // The phone can now use this userId to authenticate via the API
    });
  } catch (error) {
    console.error('Claim token error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
