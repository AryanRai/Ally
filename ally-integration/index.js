const AllyClient = require('./ally-client');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://your-digital-ocean-ip:3001';
const ALLY_CONFIG = {
  allyId: process.env.ALLY_ID || `ally-${require('os').hostname()}`,
  name: process.env.ALLY_NAME || 'Ally Desktop'
};

// Example AI model integration (replace with your actual AI model)
class ExampleAIModel {
  async generate(prompt) {
    // This is where you'd integrate with your actual AI model
    // For example: OpenAI, Anthropic, local model, etc.
    
    // Simulate AI response delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Return a mock response (replace with actual AI integration)
    return `AI Response to: "${prompt}"\n\nThis is a placeholder response. Integrate your actual AI model here.`;
  }
}

async function main() {
  console.log('Starting Ally Desktop Client...');
  
  // Create Ally client
  const ally = new AllyClient(SERVER_URL, ALLY_CONFIG);
  
  // Set up AI model (replace with your actual model)
  const aiModel = new ExampleAIModel();
  ally.setAIModel(aiModel);
  
  // Initialize and connect
  await ally.initialize();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down Ally client...');
    ally.disconnect();
    process.exit(0);
  });
  
  console.log(`Ally client running. Token: ${ally.token}`);
  console.log('Press Ctrl+C to stop.');
}

main().catch(console.error);