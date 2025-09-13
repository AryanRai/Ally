# Ally Remote Service

A web-based remote control interface for the Ally AI Assistant system. This Next.js application allows you to control and interact with your local Ally system from anywhere via a web browser.

## Features

- **Remote Chat Interface**: Full-featured chat interface with real-time messaging
- **System Dashboard**: Monitor connected Ally systems and their status
- **Authentication**: Secure user authentication via Supabase
- **Real-time Updates**: Live message updates and system status monitoring
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Glassmorphism UI**: Modern, beautiful interface with glass-like effects
- **Session Management**: Organize conversations into sessions
- **Tool Execution**: View and monitor tool execution results
- **Message History**: Persistent message storage and retrieval

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Browser   │    │  Ally Remote     │    │   Supabase      │
│                 │◄──►│  Service         │◄──►│   Database      │
│  (User Interface)│    │  (Next.js)       │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Local Ally      │
                       │  System          │
                       │  (glass-pip-chat)│
                       └──────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+ 
- A Supabase project
- A local Ally system running

### 1. Clone and Install

```bash
cd Ally/ally-remote-service
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required environment variables:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Database Setup

Create the following tables in your Supabase database:

```sql
-- Chat sessions table
CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_remote BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  response TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  is_remote BOOLEAN DEFAULT false,
  local_system_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Local systems table
CREATE TABLE local_systems (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
  capabilities JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tool executions table
CREATE TABLE tool_executions (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  parameters JSONB DEFAULT '{}',
  result JSONB,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  execution_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own sessions" ON chat_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own messages" ON chat_messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own systems" ON local_systems
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own tool executions" ON tool_executions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_messages 
      WHERE chat_messages.id = tool_executions.message_id 
      AND chat_messages.user_id = auth.uid()
    )
  );
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Deploy to Vercel

1. **Connect to Vercel**:
   ```bash
   npm install -g vercel
   vercel
   ```

2. **Set Environment Variables** in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LOCAL_SYSTEM_ID`
   - `LOCAL_SYSTEM_NAME`

3. **Deploy**:
   ```bash
   vercel --prod
   ```

### Custom Domain (Optional)

Add your custom domain in the Vercel dashboard and update:
```env
NEXT_PUBLIC_DOMAIN=your-domain.com
```

## Integration with Glass-Pip-Chat

To enable remote control from your local Ally system:

1. **Update glass-pip-chat environment**:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_SUPABASE_SERVICE_KEY=your_service_role_key
   VITE_LOCAL_SYSTEM_ID=ally-desktop-system
   VITE_LOCAL_SYSTEM_NAME=Ally Desktop System
   ```

2. **Enable remote mode** in glass-pip-chat settings

3. **Start the remote service** in glass-pip-chat

The local system will automatically:
- Register itself in the database
- Poll for new messages from the web interface
- Process messages using local LLM
- Stream responses back to the web interface

## API Endpoints

- `GET /api/messages` - Get messages for a session
- `POST /api/messages` - Send a new message
- `PUT /api/messages` - Update message status/response
- `GET /api/sessions` - Get user's chat sessions
- `POST /api/sessions` - Create a new session
- `DELETE /api/sessions` - Delete a session
- `GET /api/systems` - Get connected systems
- `POST /api/systems` - Register/update a system

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `LOCAL_SYSTEM_ID` | Default system identifier | No |
| `LOCAL_SYSTEM_NAME` | Default system name | No |
| `POLL_INTERVAL` | Message polling interval (ms) | No |
| `BATCH_SIZE` | Message batch size | No |
| `HEARTBEAT_INTERVAL` | System heartbeat interval (ms) | No |

### Customization

- **Themes**: Modify `src/app/globals.css` for custom styling
- **Components**: Extend components in `src/components/`
- **API**: Add custom endpoints in `src/app/api/`

## Security

- **Authentication**: All routes require authentication
- **Row Level Security**: Database access is restricted by user
- **API Protection**: Server-side validation and authorization
- **HTTPS**: Enforced in production
- **CORS**: Configured for secure cross-origin requests

## Troubleshooting

### Common Issues

1. **Authentication Errors**:
   - Check Supabase URL and keys
   - Verify RLS policies are set up correctly

2. **Connection Issues**:
   - Ensure local Ally system is running
   - Check network connectivity
   - Verify environment variables

3. **Message Not Processing**:
   - Check local system status in dashboard
   - Verify polling service is running
   - Check browser console for errors

### Debug Mode

Enable debug logging:
```env
NODE_ENV=development
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

Apache-2.0 License - see LICENSE file for details.

## Support

For support and questions:
- Check the troubleshooting section
- Review the glass-pip-chat integration guide
- Open an issue on GitHub