# Ally Remote Control System Deployment Guide

This system allows you to remotely control and monitor your AI agent (Ally) through a web interface using a Digital Ocean server as middleware.

## Architecture

```
Web App (Vercel) ←→ Digital Ocean Server ←→ Local Ally (Desktop)
```

## Components

1. **Digital Ocean Server** - Middleware with WebSocket support
2. **Next.js Web App** - Remote control interface (deployable to Vercel)
3. **Local Ally Client** - Connects your desktop AI to the middleware

## Setup Instructions

### 1. Digital Ocean Server Setup

1. Create a 2GB RAM droplet on Digital Ocean
2. Upload the `digital-ocean-server/` folder to your droplet
3. Run the deployment script:

```bash
# On your droplet
chmod +x deploy.sh
./deploy.sh
```

4. Note your droplet's IP address

### 2. Configure Environment Variables

Update the following files with your Digital Ocean IP:

**`.env.local` (for Next.js app):**
```
NEXT_PUBLIC_SOCKET_URL=http://YOUR_DROPLET_IP:3001
```

**`ally-integration/index.js`:**
```javascript
const SERVER_URL = 'http://YOUR_DROPLET_IP:3001';
```

### 3. Deploy Web App to Vercel

1. Push your Next.js app to GitHub
2. Connect to Vercel and deploy
3. Set environment variable in Vercel dashboard:
   - `NEXT_PUBLIC_SOCKET_URL=http://YOUR_DROPLET_IP:3001`

### 4. Run Local Ally Client

On your desktop machine:

```bash
cd ally-integration
npm install
npm start
```

## Usage

1. **Register Ally**: Your local client automatically registers with the server
2. **Get Token**: The server provides a unique token for your Ally instance
3. **Web Control**: Use the web interface at aryanrai.me to control your Ally
4. **Real-time Communication**: Send commands and receive responses in real-time

## API Endpoints

### Server Endpoints

- `POST /api/ally/register` - Register new Ally instance
- `GET /api/ally/instances` - Get all registered instances

### WebSocket Events

**From Web Client:**
- `web:connect` - Connect as web client
- `command:send` - Send command to Ally

**From Ally Client:**
- `ally:connect` - Connect as Ally instance
- `response:send` - Send response to web clients
- `ally:status` - Update Ally status

## Security Considerations

1. **Firewall**: Only open necessary ports (3001 for the middleware)
2. **Authentication**: Consider adding API keys for production use
3. **HTTPS**: Set up SSL certificates for production deployment
4. **Rate Limiting**: Implement rate limiting to prevent abuse

## Customization

### Integrating Your AI Model

In `ally-integration/index.js`, replace the `ExampleAIModel` with your actual AI model:

```javascript
class YourAIModel {
  async generate(prompt) {
    // Your AI model integration here
    // e.g., OpenAI API, local model, etc.
    return await yourAIModel.generate(prompt);
  }
}
```

### Adding Custom Commands

Extend the `handleCommand` method in `ally-client.js`:

```javascript
case 'your-custom-command':
  response = await this.handleCustomCommand(payload);
  break;
```

## Monitoring

Use PM2 to monitor your server:

```bash
pm2 status          # Check status
pm2 logs            # View logs
pm2 restart ally-middleware  # Restart server
```

## Troubleshooting

1. **Connection Issues**: Check firewall settings and ensure port 3001 is open
2. **CORS Errors**: Verify `ALLOWED_ORIGINS` in server environment
3. **WebSocket Failures**: Ensure your hosting provider supports WebSocket connections

## Production Considerations

1. Set up SSL/TLS certificates
2. Use environment variables for sensitive configuration
3. Implement proper logging and monitoring
4. Set up automated backups
5. Consider using a reverse proxy (nginx) for better performance