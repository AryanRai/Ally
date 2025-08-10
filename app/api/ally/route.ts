import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for active Ally instances
interface AllyInstance {
  id: string;
  token: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: number;
  messages: any[];
  isTyping: boolean;
  currentModel: string;
  platform: string;
}

const allyInstances = new Map<string, AllyInstance>();

// Generate a unique token
function generateToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// GET /api/ally - Get all Ally instances
export async function GET() {
  const instances = Array.from(allyInstances.values()).map(instance => ({
    id: instance.id,
    name: instance.name,
    status: instance.status,
    lastSeen: instance.lastSeen,
    currentModel: instance.currentModel,
    platform: instance.platform
  }));

  return NextResponse.json({ instances });
}

// POST /api/ally/register - Register a new Ally instance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, platform } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const id = Math.random().toString(36).substring(2, 15);
    const token = generateToken();

    const instance: AllyInstance = {
      id,
      token,
      name,
      status: 'online',
      lastSeen: Date.now(),
      messages: [],
      isTyping: false,
      currentModel: 'llama3.2',
      platform: platform || 'unknown'
    };

    allyInstances.set(id, instance);

    return NextResponse.json({
      id,
      token,
      message: 'Ally instance registered successfully'
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// PUT /api/ally/:id/heartbeat - Update Ally instance status
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { token, status, messages, isTyping, currentModel } = body;

    const instance = allyInstances.get(id);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    if (instance.token !== token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Update instance
    instance.status = status || 'online';
    instance.lastSeen = Date.now();
    if (messages) instance.messages = messages;
    if (isTyping !== undefined) instance.isTyping = isTyping;
    if (currentModel) instance.currentModel = currentModel;

    allyInstances.set(id, instance);

    return NextResponse.json({ message: 'Heartbeat received' });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// DELETE /api/ally/:id - Unregister an Ally instance
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    const instance = allyInstances.get(id);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    if (instance.token !== token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    allyInstances.delete(id);

    return NextResponse.json({ message: 'Instance unregistered successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}