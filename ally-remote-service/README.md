# Ally Remote Service

This is the remote chat API service that enables web-based interaction with the local Ally system through Supabase backend infrastructure.

## Architecture Overview

The system consists of:
- **Supabase Database**: Stores chat messages, sessions, tool executions, and local system registrations
- **Supabase Edge Functions**: Handle authentication, message management, streaming, and system coordination
- **Web Interface** (Next.js): Provides glassmorphic chat interface (to be implemented in next tasks)
- **Local Message Poller**: Bridges local Ally system with remote messages (to be implemented in next tasks)

## Database Schema

The following tables have been created:

### `chat_sessions`
- Stores chat session information
- Links to authenticated users
- Supports both local and remote sessions

### `chat_messages`
- Stores individual chat messages and responses
- Supports real-time streaming response updates
- Links to sessions and tracks processing status

### `tool_executions`
- Tracks tool execution details and results
- Links to messages for context
- Provides execution timing and status

### `local_systems`
- Registers local Ally systems
- Tracks heartbeat and online status
- Stores system capabilities and metadata

## Edge Functions

### `/functions/v1/auth`
- **POST /login**: User authentication
- **POST /register**: User registration
- **GET /user**: Get current user info

### `/functions/v1/messages`
- **POST**: Create new message
- **GET**: Retrieve messages/sessions
- **PUT**: Update message status/response

### `/functions/v1/stream`
- **GET**: Server-Sent Events for real-time updates
- Streams message updates, tool executions, and status changes

### `/functions/v1/systems`
- **POST /register**: Register local system
- **POST /heartbeat**: Update system heartbeat
- **POST /messages**: Get pending messages for local system
- **GET**: List user's systems
- **PUT**: Update system status/capabilities

## Security Features

- **Row Level Security (RLS)**: Users can only access their own data
- **JWT Authentication**: Secure token-based authentication
- **Input Validation**: All inputs are validated and sanitized
- **CORS Configuration**: Proper cross-origin request handling

## Real-time Features

- **Realtime Subscriptions**: Enabled for all tables
- **Server-Sent Events**: Real-time streaming of responses
- **Heartbeat System**: Tracks local system availability
- **Message Status Tracking**: Real-time status updates

## Database Functions

### `append_message_response(message_id, new_content)`
Atomically appends content to message responses for streaming.

### `update_system_heartbeat(system_id, new_status)`
Updates local system heartbeat and status.

### `get_pending_messages(system_id, batch_size)`
Retrieves pending messages for a local system to process.

### `update_message_status(message_id, new_status, error_msg)`
Updates message processing status with timestamps.

## Setup Instructions

1. **Environment Configuration**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

2. **Database Setup**:
   The database schema has already been deployed to the Ally Supabase project.

3. **Edge Functions**:
   All Edge Functions have been deployed and are available at:
   - `https://delzfrzfwhycdzozxwgp.supabase.co/functions/v1/auth`
   - `https://delzfrzfwhycdzozxwgp.supabase.co/functions/v1/messages`
   - `https://delzfrzfwhycdzozxwgp.supabase.co/functions/v1/stream`
   - `https://delzfrzfwhycdzozxwgp.supabase.co/functions/v1/systems`

## Next Steps

The following tasks need to be implemented:

1. **Database Schema Enhancement** (Task 2.1-2.2)
2. **Web Interface Development** (Task 4.1-4.3)
3. **Local Message Polling Service** (Task 5.1-5.3)
4. **Tool Execution Support** (Task 6.1-6.3)

## API Usage Examples

### Authentication
```javascript
// Login
const response = await fetch('https://delzfrzfwhycdzozxwgp.supabase.co/functions/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'password' })
});
```

### Send Message
```javascript
// Send message
const response = await fetch('https://delzfrzfwhycdzozxwgp.supabase.co/functions/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    content: 'Hello, Ally!',
    localSystemId: 'ally-local-system'
  })
});
```

### Real-time Streaming
```javascript
// Connect to real-time stream
const eventSource = new EventSource(
  `https://delzfrzfwhycdzozxwgp.supabase.co/functions/v1/stream?sessionId=${sessionId}`,
  {
    headers: { 'Authorization': `Bearer ${token}` }
  }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

## Requirements Satisfied

This implementation satisfies the following requirements from the specification:

- **6.1**: Database schema for remote chat messages and sessions
- **6.2**: User authentication and data isolation with RLS
- **6.3**: Real-time subscriptions for chat messages and tool executions
- **6.4**: Tool execution tracking and logging
- **6.5**: Local system registration and heartbeat management

The Supabase backend infrastructure is now fully set up and ready for the next implementation tasks.