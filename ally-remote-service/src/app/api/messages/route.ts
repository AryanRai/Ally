import { createClient } from '@/lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    return NextResponse.json({ messages: data || [] });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content, session_id, metadata = {} } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const messageId = uuidv4();
    const sessionId = session_id || `session_${Date.now()}`;

    // Find an available local system for this user
    console.log('🔍 Messages API: Finding available local system for user:', session.user.id);
    
    const { data: systems, error: systemsError } = await supabase
      .from('local_systems')
      .select('id, name, status, last_heartbeat')
      .eq('user_id', session.user.id)
      .order('last_heartbeat', { ascending: false });

    if (systemsError) {
      console.error('❌ Messages API: Failed to fetch local systems:', systemsError);
      return NextResponse.json({ error: 'Failed to find local systems' }, { status: 500 });
    }

    console.log('📊 Messages API: Found systems:', systems);
    console.log('🔍 Messages API: Request metadata:', metadata);

    let targetSystem;

    // Check if a specific system was requested
    if (metadata.target_system_id) {
      console.log('🎯 Messages API: Looking for specific system:', metadata.target_system_id);
      targetSystem = (systems || []).find((s: any) => s.id === metadata.target_system_id);
      
      if (!targetSystem) {
        console.log('❌ Messages API: Requested system not found:', metadata.target_system_id);
        return NextResponse.json({ 
          error: `Requested system '${metadata.target_system_id}' not found or not accessible.` 
        }, { status: 400 });
      }

      // Check if the system is active
      const now = new Date();
      const lastHeartbeat = new Date(targetSystem.last_heartbeat);
      const timeDiff = now.getTime() - lastHeartbeat.getTime();
      const isActive = timeDiff < 60000; // Active within last minute

      if (!isActive) {
        console.log('❌ Messages API: Requested system is offline:', metadata.target_system_id);
        return NextResponse.json({ 
          error: `Requested system '${targetSystem.name}' is currently offline.` 
        }, { status: 400 });
      }

      console.log('✅ Messages API: Using requested system:', targetSystem);
    } else {
      // Auto-select the most recently active system
      const now = new Date();
      const activeSystems = (systems || []).filter((system: any) => {
        const lastHeartbeat = new Date(system.last_heartbeat);
        const timeDiff = now.getTime() - lastHeartbeat.getTime();
        return timeDiff < 60000; // Active within last minute
      });

      console.log('🟢 Messages API: Active systems:', activeSystems);

      if (activeSystems.length === 0) {
        console.log('❌ Messages API: No active local systems found');
        return NextResponse.json({ 
          error: 'No active local systems found. Please ensure your local Ally system is running and connected.' 
        }, { status: 400 });
      }

      targetSystem = activeSystems[0]; // Use the most recently active system
      console.log('🎯 Messages API: Auto-selected target system:', targetSystem);
    }

    // Create message record
    const messageData = {
      id: messageId,
      session_id: sessionId,
      user_id: session.user.id,
      content,
      response: '',
      status: 'pending' as const,
      metadata: {
        source: 'web',
        target_system: targetSystem.name,
        ...metadata
      },
      is_remote: true,
      local_system_id: targetSystem.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('📝 Messages API: Creating message with data:', messageData);

    const { data, error } = await supabase
      .from('chat_messages')
      .insert(messageData)
      .select()
      .single();

    if (error) {
      console.error('❌ Messages API: Database error creating message:', error);
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
    }

    console.log('✅ Messages API: Message created successfully:', data);

    // Create or update session record
    const sessionData = {
      id: sessionId,
      user_id: session.user.id,
      title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      metadata: {
        created_by: 'web',
        last_message_at: new Date().toISOString()
      },
      is_remote: true,
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('chat_sessions')
      .upsert(sessionData, { onConflict: 'id' });

    const response = {
      message: data,
      session_id: sessionId,
      status: 'pending',
      target_system: targetSystem.name
    };

    console.log('📤 Messages API: Returning response:', response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  
  try {
    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message_id, status, response, error_message } = body;

    if (!message_id) {
      return NextResponse.json({ error: 'Message ID is required' }, { status: 400 });
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (response) updateData.response = response;
    if (error_message) updateData.error_message = error_message;
    if (status === 'processing') updateData.processed_at = new Date().toISOString();
    if (status === 'completed') updateData.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('chat_messages')
      .update(updateData)
      .eq('id', message_id)
      .eq('user_id', session.user.id)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}