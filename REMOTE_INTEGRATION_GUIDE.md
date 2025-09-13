# Ally Remote Integration Guide

This guide explains how to set up and use the Ally Remote Service to control your local Ally system from anywhere via a web browser.

## Overview

The Ally Remote system consists of two main components:

1. **ally-remote-service**: A Next.js web application hosted on Vercel
2. **glass-pip-chat**: Your local Ally system with remote capabilities

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Browser   │    │  Ally Remote     │    │   Supabase      │
│                 │◄──►│  Service         │◄──►│   Database      │
│  (User Interface)│    │  (Vercel)        │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Local Ally      │
                       │  System          │
                       │  (glass-pip-chat)│
                       └──────────────────┘
```

## Prerequisites

- Node.js 18+
- A Supabase account and project
- Your local Ally system (glass-pip-chat) running
- A Vercel account (for deployment)

## Step 1: Set Up Supabase Database

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note down your project URL and API keys

### 1.2 Create Database Tables

Run the following SQL in your Supabase SQL editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Enable Row Level Security
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
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

-- Create function to update system heartbeat
CREATE OR REPLACE FUNCTION update_system_heartbeat(system_id TEXT, new_status TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE local_systems 
  SET last_heartbeat = NOW(), status = new_status
  WHERE id = system_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 1.3 Configure Authentication

1. In Supabase Dashboard, go to Authentication > Settings
2. Enable email authentication
3. Configure your site URL (will be your Vercel domain later)

## Step 2: Deploy Ally Remote Service

### 2.1 Deploy to Vercel

1. **Fork or clone the repository**
2. **Connect to Vercel**:
   ```bash
   cd Ally/ally-remote-service
   npm install -g vercel
   vercel
   ```

3. **Set Environment Variables** in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
   - `LOCAL_SYSTEM_ID`: `ally-web-system`
   - `LOCAL_SYSTEM_NAME`: `Ally Web System`

4. **Deploy**:
   ```bash
   vercel --prod
   ```

5. **Note your deployment URL** (e.g., `https://your-ally-remote.vercel.app`)

### 2.2 Update Supabase Settings

1. In Supabase Dashboard, go to Authentication > Settings
2. Add your Vercel URL to "Site URL" and "Redirect URLs"

## Step 3: Configure Local Ally System

### 3.1 Update Environment Variables

1. **Copy the environment template**:
   ```bash
   cd Ally/glass-pip-chat
   cp .env.example .env.local
   ```

2. **Update `.env.local`** with your values:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=your_supabase_url_here
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   VITE_SUPABASE_SERVICE_KEY=your_supabase_service_role_key_here

   # Local System Configuration
   VITE_LOCAL_SYSTEM_ID=ally-desktop-system
   VITE_LOCAL_SYSTEM_NAME=Ally Desktop System

   # Remote Service Configuration
   VITE_REMOTE_SERVICE_URL=https://your-ally-remote.vercel.app
   VITE_ENABLE_REMOTE=true
   ```

### 3.2 Install Dependencies

```bash
cd Ally/glass-pip-chat
npm install
```

## Step 4: Test the Integration

### 4.1 Start Local Ally System

```bash
cd Ally/glass-pip-chat
npm run dev
```

### 4.2 Enable Remote Mode

1. Open your local Ally system
2. Go to Settings
3. Enable "Remote Mode"
4. Sign in with your Supabase account
5. Start the remote service

### 4.3 Test Web Interface

1. Open your Vercel deployment URL in a browser
2. Sign in with the same account
3. Start a new chat
4. Send a message
5. Verify it appears in your local system and gets processed

## Step 5: Usage

### Web Interface Features

- **Chat Interface**: Full-featured chat with your AI assistant
- **Session Management**: Organize conversations into sessions
- **System Dashboard**: Monitor connected local systems
- **Real-time Updates**: Live message updates and system status
- **Mobile Responsive**: Works on all devices

### Local System Features

- **Remote Message Processing**: Processes messages from web interface
- **Tool Execution**: Runs tools and returns results to web
- **System Registration**: Automatically registers with remote service
- **Heartbeat Monitoring**: Maintains connection status
- **Error Recovery**: Handles connection issues gracefully

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Check Supabase URL and keys are correct
   - Verify RLS policies are set up
   - Check redirect URLs in Supabase settings

2. **Connection Issues**
   - Ensure local Ally system is running
   - Check network connectivity
   - Verify environment variables are set

3. **Messages Not Processing**
   - Check local system status in web dashboard
   - Verify remote service is started in local system
   - Check browser console for errors

4. **Database Errors**
   - Verify all tables are created
   - Check RLS policies are enabled
   - Ensure user has proper permissions

### Debug Steps

1. **Check Local System Status**:
   - Open local Ally system
   - Go to Settings > Remote
   - Check connection status and errors

2. **Check Web Dashboard**:
   - Open web interface
   - Go to Dashboard
   - Check if local system appears as "online"

3. **Check Browser Console**:
   - Open browser developer tools
   - Check for JavaScript errors
   - Look for network request failures

4. **Check Supabase Logs**:
   - Go to Supabase Dashboard
   - Check logs for database errors
   - Verify authentication events

## Security Considerations

- **Authentication**: All access requires user authentication
- **Row Level Security**: Database access is restricted by user
- **HTTPS**: All communication is encrypted
- **API Keys**: Service role key is only used server-side
- **CORS**: Configured for secure cross-origin requests

## Advanced Configuration

### Custom Domain

1. Add custom domain in Vercel dashboard
2. Update Supabase redirect URLs
3. Update `VITE_REMOTE_SERVICE_URL` in local system

### Multiple Local Systems

1. Use different `VITE_LOCAL_SYSTEM_ID` for each system
2. Each system will appear separately in the dashboard
3. Messages are routed to the appropriate system

### Tool Integration

The remote system supports all local tools:
- File operations
- System commands
- Web searches
- Custom tools

Tools are executed on the local system and results are streamed back to the web interface.

## Support

For issues and questions:
1. Check this troubleshooting guide
2. Review the console logs
3. Check Supabase dashboard for errors
4. Open an issue on GitHub

## Next Steps

- Set up custom domain
- Configure additional local systems
- Integrate with mobile apps
- Add voice control via web interface
- Set up monitoring and analytics