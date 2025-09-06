import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientFromRequest } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClientFromRequest(request)
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { content, sessionId, metadata = {} } = body

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      )
    }

    // Create or get session
    let finalSessionId = sessionId
    if (!sessionId) {
      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert([{
          user_id: user.id,
          title: content.slice(0, 50) + (content.length > 50 ? '...' : ''),
          is_remote: true,
          metadata: {}
        }])
        .select()
        .single()

      if (sessionError) {
        console.error('Error creating session:', sessionError)
        return NextResponse.json(
          { error: 'Failed to create session' },
          { status: 500 }
        )
      }

      finalSessionId = sessionData.id
    }

    // Create message
    const messageData = {
      user_id: user.id,
      content,
      session_id: finalSessionId,
      is_remote: true,
      local_system_id: 'default', // This should be configurable
      status: 'pending' as const,
      metadata,
      response: ''
    }

    const { data: messageResult, error: messageError } = await supabase
      .from('chat_messages')
      .insert([messageData])
      .select()
      .single()

    if (messageError) {
      console.error('Error creating message:', messageError)
      return NextResponse.json(
        { error: 'Failed to create message' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      messageId: messageResult.id,
      sessionId: finalSessionId,
      status: 'pending',
      estimatedProcessingTime: 5000 // 5 seconds estimate
    })

  } catch (error) {
    console.error('Error in POST /api/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClientFromRequest(request)
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching messages:', error)
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      messages: data || [],
      hasMore: (data?.length || 0) === limit
    })

  } catch (error) {
    console.error('Error in GET /api/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}