# Quick Setup Guide for Remote Integration

## Getting Started in 3 Steps

### Step 1: Start the App
```bash
cd Ally/glass-pip-chat
npm run dev
```

### Step 2: Create an Account
1. Click the **LOCAL** button in the top-right corner
2. Select **REMOTE** mode
3. Click "Need an account? Click here" to expand the helper
4. Use the default credentials or enter your own:
   - Email: `test@example.com`
   - Password: `test123456`
5. Click **Sign Up** to create the account
6. Check your email and confirm the account (if required)

### Step 3: Sign In and Start
1. Click **Sign In** with your credentials
2. Click **Start Service** to begin remote polling
3. You should see the status change to "Connected"

## Testing the Integration

### Using the Built-in Test
1. Once connected, click **Test Remote Service**
2. This will verify all components are working
3. Look for "✅ Remote service is healthy and running"

### Manual Testing
1. Open the ally-remote-service web interface
2. Send a message from the web
3. Watch it appear in your local glass-pip-chat
4. See the response stream back to the web interface

## Troubleshooting

### "Invalid login credentials"
- Make sure you've confirmed your email address
- Try creating a new account with a different email
- Use the AuthHelper component to test authentication

### "Service Not Starting"
- Check that all environment variables are set
- Verify Ollama is running locally
- Look at browser console for detailed errors

### "Connection Failed"
- Verify your internet connection
- Check that Supabase URLs are correct
- Try the "Test DB" button in AuthHelper

## Default Test Credentials

For quick testing, you can use:
- **Email**: `test@example.com`
- **Password**: `test123456`

Or create your own account with any valid email address.

## What Happens Next

Once authenticated and connected:
1. **Local Processing**: Your local Ally system processes remote messages
2. **Real-time Streaming**: Responses stream back word-by-word
3. **Tool Execution**: Local tools run and results are included
4. **Status Monitoring**: Real-time connection and health monitoring

The system is now ready for remote AI assistance while keeping all processing local!