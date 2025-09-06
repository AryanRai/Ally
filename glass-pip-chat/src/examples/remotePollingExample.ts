/**
 * Remote Message Polling Service Example
 * 
 * This example demonstrates how to initialize and use the remote message polling service
 * to connect the local Ally system with the remote web interface via Supabase.
 */

import { remoteServiceManager } from '../services/remoteServiceManager';

async function startRemotePollingExample() {
  console.log('🚀 Starting Remote Message Polling Service Example');
  
  try {
    // Start the remote service manager
    console.log('📡 Starting remote services...');
    await remoteServiceManager.start();
    
    // Check initial status
    const status = remoteServiceManager.getStatus();
    console.log('📊 Service Status:', {
      isRunning: status.isRunning,
      systemId: status.pollerStatus.systemId,
      ollamaConnected: status.processorStatus.ollamaConnected,
      toolCallingEnabled: status.processorStatus.toolCallingEnabled
    });
    
    // Perform health check
    console.log('🏥 Performing health check...');
    const health = await remoteServiceManager.healthCheck();
    console.log('Health Status:', {
      healthy: health.healthy,
      issues: health.issues
    });
    
    // Monitor for a while
    console.log('👀 Monitoring service for 30 seconds...');
    const monitorInterval = setInterval(() => {
      const currentStatus = remoteServiceManager.getStatus();
      const metrics = remoteServiceManager.getMetrics();
      
      console.log(`⏱️  Uptime: ${Math.floor(metrics.uptime / 1000)}s | Polling: ${currentStatus.pollerStatus.isPolling} | Retries: ${currentStatus.pollerStatus.retryCount}`);
    }, 5000);
    
    // Stop monitoring after 30 seconds
    setTimeout(async () => {
      clearInterval(monitorInterval);
      
      console.log('🛑 Stopping remote services...');
      await remoteServiceManager.stop();
      
      console.log('✅ Remote polling example completed');
    }, 30000);
    
  } catch (error) {
    console.error('❌ Failed to run remote polling example:', error);
  }
}

// Example of how to integrate with existing Ally components
async function integrateWithExistingAlly() {
  console.log('🔗 Integration Example with Existing Ally Components');
  
  try {
    // Start services
    await remoteServiceManager.start();
    
    // The remote message poller will now:
    // 1. Poll Supabase for new remote messages every 2 seconds
    // 2. Process messages through the existing OllamaService
    // 3. Execute tools through the existing ToolCallingService
    // 4. Stream responses back to Supabase in real-time
    // 5. Handle errors and retries automatically
    
    console.log('✅ Remote polling is now integrated with existing Ally services');
    console.log('🌐 Users can now interact with this local system through the web interface');
    console.log('📱 Messages sent from the web will be processed locally and responses streamed back');
    
    // In a real application, you would keep this running
    // For the example, we'll stop after a short time
    setTimeout(async () => {
      await remoteServiceManager.stop();
      console.log('🏁 Integration example completed');
    }, 10000);
    
  } catch (error) {
    console.error('❌ Integration example failed:', error);
  }
}

// Run the examples
if (require.main === module) {
  console.log('🎯 Choose an example to run:');
  console.log('1. Basic remote polling example');
  console.log('2. Integration with existing Ally components');
  
  const exampleChoice = process.argv[2] || '1';
  
  if (exampleChoice === '1') {
    startRemotePollingExample();
  } else if (exampleChoice === '2') {
    integrateWithExistingAlly();
  } else {
    console.log('❓ Invalid choice. Use "1" or "2"');
  }
}

export {
  startRemotePollingExample,
  integrateWithExistingAlly
};