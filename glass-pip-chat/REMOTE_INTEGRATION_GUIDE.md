# Remote Integration Guide

## Overview

The Glass PiP Chat app now includes full integration with the remote message polling system, allowing you to:

- Switch between LOCAL and REMOTE modes
- Authenticate with Supabase
- Process remote messages through your local Ally system
- Stream responses back to the web interface in real-time

## Getting Started

### 1. Environment Setup

Make sure your `.env.local` file in the `glass-pip-chat` directory contains:

```bash
# Supabase Configuration (VITE_ prefix for browser access)
VITE_SUPABASE_URL=https://delzfrzfwhycdzozxwgp.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNjE2NjQsImV4cCI6MjA3MjczNzY2NH0.aWqbefKFuWZHXbmgjp-a0_QoD17PBrxlIDH_hoIYd9g
VITE_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlbHpmcnpmd2h5Y2R6b3p4d2dwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzE2MTY2NCwiZXhwIjoyMDcyNzM3NjY0fQ.xBgsm4NsZSde7Emm65GWaE0TcLl1xQhx6Uhx2h4tV20

# Local System Configuration (VITE_ prefix for browser access)
VITE_LOCAL_SYSTEM_ID=ally-local-system
VITE_LOCAL_SYSTEM_NAME=Ally Local System
VITE_POLL_INTERVAL=2000
VITE_BATCH_SIZE=10
VITE_HEARTBEAT_INTERVAL=30000
```

### 2. Starting the App

1. Start the glass-pip-chat app:
   ```bash
   cd Ally/glass-pip-chat
   npm run dev
   ```

2. The app will open with the LOCAL/REMOTE toggle in the top-right corner

### 3. Switching to Remote Mode

1. Click the **LOCAL** button in the top-right corner
2. Select **REMOTE** from the dropdown
3. Click **Sign In to Enable Remote** 
4. Enter your Supabase credentials or create a new account
5. Once authenticated, click **Start Service**

## Features

### Remote Settings Panel

The remote settings panel provides:

- **Mode Selection**: Switch between LOCAL and REMOTE modes
- **Authentication**: Sign in/up with Supabase
- **Service Control**: Start/stop the remote polling service
- **Status Monitoring**: Real-time service health and connection status
- **Test Button**: Verify the remote integration is working

### Remote Activity Indicator

When in remote mode, you'll see an activity indicator showing:

- Connection status (Connected/Disconnected)
- Processing status (when remote messages are being handled)
- System ID and uptime information
- Error indicators if issues occur

### Message Processing

In remote mode:

1. **Incoming Messages**: Messages from the web interface appear with a 🌐 icon
2. **Local Processing**: Your local Ally system processes the messages using existing tools and LLM
3. **Response Streaming**: Responses are streamed word-by-word back to the web interface
4. **Tool Execution**: Tools are executed locally and results included in responses

## User Interface Changes

### Visual Indicators

- **LOCAL Mode**: Blue monitor icon, indicates local-only operation
- **REMOTE Mode**: Green globe icon when connected, red when disconnected
- **Activity Indicator**: Shows when remote messages are being processed
- **Message Badges**: Remote messages are marked with 🌐 icon

### Status Information

The interface shows:
- Current mode (LOCAL/REMOTE)
- Connection status
- Authentication status
- Service health
- Active message processing
- System uptime

## Troubleshooting

### Common Issues

1. **"Not Authenticated" Error**
   - Make sure you've signed in with valid Supabase credentials
   - Check that your email is verified if you created a new account

2. **"Service Not Starting" Error**
   - Verify environment variables are set correctly
   - Check that Ollama is running locally
   - Ensure no firewall is blocking connections

3. **"Connection Failed" Error**
   - Check your internet connection
   - Verify Supabase URL and keys are correct
   - Try refreshing the service status

4. **Messages Not Processing**
   - Ensure the service is running (green status)
   - Check that Ollama is accessible
   - Verify tool calling framework is enabled

### Debug Steps

1. **Check Service Status**
   - Click the "Test Remote Service" button
   - Review the status information in the remote panel
   - Look for error messages in the browser console

2. **Verify Configuration**
   - Ensure all environment variables are set
   - Check that Supabase credentials are valid
   - Confirm local system ID is unique

3. **Monitor Logs**
   - Open browser developer tools
   - Check console for error messages
   - Look for network request failures

## Advanced Configuration

### Custom System ID

You can customize your local system ID by setting:
```bash
VITE_LOCAL_SYSTEM_ID=my-custom-ally-system
VITE_LOCAL_SYSTEM_NAME=My Custom Ally System
```

### Performance Tuning

Adjust polling and streaming settings:
```bash
VITE_POLL_INTERVAL=1000          # Poll every 1 second (faster)
VITE_BATCH_SIZE=5                # Smaller batches (more responsive)
VITE_HEARTBEAT_INTERVAL=15000    # More frequent heartbeats
```

### Security Settings

For production use:
```bash
REQUIRE_AUTH=true
ALLOWED_ORIGINS=https://your-domain.com
```

## Integration with Web Interface

### Message Flow

1. **Web → Local**: User sends message via web interface
2. **Database**: Message stored in Supabase with status 'pending'
3. **Polling**: Local system polls and finds new message
4. **Processing**: Message processed through local Ally system
5. **Streaming**: Response streamed back to database
6. **Web Update**: Web interface receives real-time updates

### Real-time Features

- **Live Status**: Web interface shows local system online/offline
- **Streaming Responses**: Word-by-word response streaming
- **Tool Execution**: Real-time tool execution status
- **Error Handling**: Graceful error recovery and reporting

## Development Notes

### Architecture

The integration consists of:

- **RemoteServiceManager**: Manages service lifecycle
- **RemoteMessagePoller**: Polls Supabase for new messages
- **RemoteMessageProcessor**: Processes messages through existing Ally services
- **ResponseStreamer**: Streams responses back to Supabase
- **RemoteSettings**: UI for managing remote connection
- **RemoteActivityIndicator**: Shows remote activity status

### Extension Points

You can extend the system by:

- Adding custom message processors
- Implementing additional authentication methods
- Creating custom status indicators
- Adding message filtering and routing
- Implementing message queuing and prioritization

## Support

If you encounter issues:

1. Check this guide for common solutions
2. Review the browser console for error messages
3. Test the connection using the built-in test button
4. Verify your Supabase configuration
5. Ensure all dependencies are installed and up to date

The remote integration provides a seamless bridge between your local Ally system and remote web access, enabling powerful distributed AI assistance while maintaining local control and privacy.