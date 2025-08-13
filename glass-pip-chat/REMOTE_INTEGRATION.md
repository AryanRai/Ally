# Glass PiP Chat - Remote Control Integration

Your Glass PiP Chat now has remote control capabilities! You can control and monitor your AI assistant from anywhere using a web dashboard.

## 🏗️ Architecture

```
Web Dashboard (aryanrai.me) ←→ Digital Ocean Server ←→ Glass PiP Chat (Desktop)
```

## 🚀 Quick Setup

### 1. Get Your Droplet IP
On your Digital Ocean server, run:
```bash
curl -4 icanhazip.com
```

### 2. Configure Glass PiP Chat
Run this in your glass-pip-chat directory:
```bash
node configure-remote.js YOUR_DROPLET_IP
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Start Glass PiP Chat
```bash
npm run dev
```

### 5. Connect to Remote Server
1. Look for the remote settings button (top-right corner)
2. Click it to open the remote control panel
3. Verify the server URL is correct
4. Click "Connect"

## 🎮 Features

### Remote Control Panel
- **Connection Status**: Real-time connection indicator
- **Server Configuration**: Easy server URL management  
- **Token Display**: Secure token for your Ally instance
- **Auto-reconnection**: Handles network interruptions

### Remote Capabilities
- **Message Forwarding**: Messages from web dashboard appear in your chat
- **Response Streaming**: Your AI responses are sent back to the web
- **Status Monitoring**: Real-time connection and system status
- **Secure Authentication**: Unique tokens for each Ally instance

## 🔧 Configuration

### Server URL
The default server URL is configured in `src/config/remote.ts`:
```typescript
DEFAULT_SERVER_URL: 'http://YOUR_DROPLET_IP:3001'
```

### Auto-Connect
To enable automatic connection on startup:
```typescript
AUTO_CONNECT: true
```

### Ally Name
Customize your Ally's display name:
```typescript
DEFAULT_ALLY_NAME: 'My Custom Ally'
```

## 🌐 Web Dashboard

Deploy the web dashboard to control your Ally remotely:

1. **Deploy to Vercel**: Use the `ally-remote-system/web-dashboard` folder
2. **Set Environment Variable**: `NEXT_PUBLIC_SOCKET_URL=http://YOUR_DROPLET_IP:3001`
3. **Access Dashboard**: Visit your deployed URL (e.g., aryanrai.me)

## 🔒 Security

- **Unique Tokens**: Each Ally instance gets a unique authentication token
- **CORS Protection**: Server validates allowed origins
- **Local Storage**: Server URLs are saved locally for convenience
- **No Sensitive Data**: Only chat messages and status are transmitted

## 🛠️ Troubleshooting

### Connection Issues
1. **Check Server Status**: Ensure your Digital Ocean server is running
2. **Verify IP Address**: Make sure the droplet IP is correct
3. **Firewall Settings**: Ensure port 3001 is open
4. **Network Connectivity**: Test connection to `http://YOUR_DROPLET_IP:3001`

### Common Solutions
```bash
# Check server status on droplet
pm2 status

# Restart server if needed
pm2 restart ally-middleware

# Check server logs
pm2 logs ally-middleware
```

### Reset Configuration
To reset your remote configuration:
1. Clear localStorage: Open DevTools → Application → Local Storage → Clear
2. Reconfigure: Run `node configure-remote.js YOUR_DROPLET_IP` again

## 📱 Usage Examples

### Sending Commands from Web
1. Open web dashboard at your deployed URL
2. Select your Glass PiP Ally instance
3. Type a message and press Enter
4. See the message appear in your desktop Glass PiP Chat

### Monitoring Status
- **Green indicator**: Connected and ready
- **Yellow indicator**: Connecting or reconnecting  
- **Red indicator**: Disconnected or error

### Remote Message Flow
1. **Web → Server → Desktop**: Commands from web dashboard
2. **Desktop → Server → Web**: Responses and status updates
3. **Real-time**: All communication happens instantly via WebSockets

## 🔄 Integration Details

### New Components Added
- `src/services/allyRemoteClient.ts` - Core remote client
- `src/hooks/useAllyRemote.ts` - React hook for remote functionality
- `src/components/RemoteSettings.tsx` - UI for remote configuration
- `src/config/remote.ts` - Configuration management

### Modified Components
- `src/components/GlassChatPiP.tsx` - Integrated remote functionality
- `package.json` - Added socket.io-client and uuid dependencies

The remote integration is designed to be non-intrusive - your Glass PiP Chat works exactly the same whether connected or not!