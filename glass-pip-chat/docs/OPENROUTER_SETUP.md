# OpenRouter Integration Setup

Glass PiP Chat now supports both local Ollama models and cloud-based models through OpenRouter. This gives you access to the latest AI models from OpenAI, Anthropic, Google, and more.

## Quick Setup

### 1. Get an OpenRouter API Key

1. Visit [OpenRouter](https://openrouter.ai/keys)
2. Sign up for an account
3. Generate an API key (starts with `sk-or-`)
4. Add credits to your account (most models cost $0.001-0.01 per 1K tokens)

### 2. Configure in Glass PiP Chat

1. Open Glass PiP Chat
2. Press `Ctrl+S` or `F1` to open Settings
3. Click "AI Provider Settings" button
4. Enter your OpenRouter API key
5. Select your preferred default model
6. Choose "OpenRouter" as your preferred provider
7. Click "Save Settings"

## Popular Models

### Most Capable
- **Claude 3.5 Sonnet** (`anthropic/claude-3.5-sonnet`) - Best reasoning and coding
- **GPT-4o** (`openai/gpt-4o`) - Latest GPT-4 with improved capabilities
- **Llama 3.1 405B** (`meta-llama/llama-3.1-405b-instruct`) - Largest open model

### Fast & Affordable
- **GPT-4o Mini** (`openai/gpt-4o-mini`) - Fast and cost-effective
- **Claude 3 Haiku** (`anthropic/claude-3-haiku`) - Ultra-fast responses
- **Gemini Flash 1.5** (`google/gemini-flash-1.5`) - Google's fast model

### Specialized
- **Perplexity Sonar** (`perplexity/llama-3.1-sonar-large-128k-online`) - Real-time web search
- **Qwen 2.5 72B** (`qwen/qwen-2.5-72b-instruct`) - Excellent for multilingual tasks

## Cost Management

- Most models cost $0.001-0.01 per 1K tokens
- A typical conversation uses 500-2000 tokens
- Set up billing alerts in your OpenRouter dashboard
- Start with smaller models like GPT-4o Mini to test

## Switching Between Providers

You can easily switch between Ollama (local) and OpenRouter (cloud):

1. **Quick Switch**: In provider settings, change "Preferred Provider"
2. **Model-Specific**: Use model names with prefixes:
   - `anthropic/claude-3.5-sonnet` → Uses OpenRouter
   - `llama3.2` → Uses local Ollama

## Troubleshooting

### "OpenRouter not available"
- Check your API key is correct
- Ensure you have credits in your account
- Verify internet connection

### "Model not found"
- Check the model ID is correct
- Some models may not be available in your region
- Try a different model from the popular list

### High costs
- Use smaller models for simple tasks
- Monitor usage in OpenRouter dashboard
- Set up billing alerts

## Benefits of OpenRouter

✅ **Latest Models**: Access to GPT-4, Claude 3.5, Gemini Pro  
✅ **No Setup**: No need to download or run models locally  
✅ **Fast**: Cloud-based inference with global CDN  
✅ **Reliable**: Enterprise-grade infrastructure  
✅ **Cost-Effective**: Pay only for what you use  

## Benefits of Ollama (Local)

✅ **Privacy**: All data stays on your machine  
✅ **Free**: No per-token costs after initial setup  
✅ **Offline**: Works without internet connection  
✅ **Customizable**: Fine-tune models for your needs  

Choose the provider that best fits your needs, or use both depending on the task!