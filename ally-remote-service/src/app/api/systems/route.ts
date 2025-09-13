import { createClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      console.log('🔒 Systems API: Authentication failed', { authError, hasSession: !!session });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 Systems API: Fetching systems for user:', session.user.id);

    const { data, error } = await supabase
      .from('local_systems')
      .select('*')
      .eq('user_id', session.user.id)
      .order('last_heartbeat', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch systems' }, { status: 500 });
    }

    console.log('📊 Raw systems data from DB:', data);

    // Calculate system status based on last heartbeat
    const now = new Date();
    const systems = (data || []).map((system: any) => {
      const lastHeartbeat = new Date(system.last_heartbeat);
      const timeDiff = now.getTime() - lastHeartbeat.getTime();
      const isOnline = timeDiff < 60000; // Consider offline if no heartbeat for 1 minute
      
      console.log(`🕐 System ${system.id}: last_heartbeat=${system.last_heartbeat}, timeDiff=${timeDiff}ms, isOnline=${isOnline}`);
      
      return {
        ...system,
        computed_status: isOnline ? system.status : 'offline',
        last_seen: timeDiff
      };
    });

    console.log('✅ Processed systems:', systems.length, systems);

    return NextResponse.json({ systems });
  } catch (error) {
    console.error('❌ API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      console.log('🔒 Systems POST: Authentication failed', { authError, hasSession: !!session });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { system_id, name, capabilities = {}, metadata = {} } = body;

    console.log('📝 Systems POST: Registering system', { 
      system_id, 
      name, 
      user_id: session.user.id,
      capabilities,
      metadata 
    });

    if (!system_id || !name) {
      console.log('❌ Systems POST: Missing required fields', { system_id, name });
      return NextResponse.json({ error: 'System ID and name are required' }, { status: 400 });
    }

    const systemData = {
      id: system_id,
      user_id: session.user.id,
      name,
      status: 'online' as const,
      capabilities,
      metadata,
      last_heartbeat: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    console.log('💾 Systems POST: Upserting system data:', systemData);

    const { data, error } = await supabase
      .from('local_systems')
      .upsert(systemData, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      return NextResponse.json({ error: 'Failed to register system' }, { status: 500 });
    }

    console.log('✅ Systems POST: System registered successfully:', data);

    return NextResponse.json({ system: data });
  } catch (error) {
    console.error('❌ API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}