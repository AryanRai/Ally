/**
 * Message Flow Test Component
 * 
 * Tests and verifies the actual message flow from Glass Chat UI to Stream Handler
 * Shows each stage of the integration pipeline with real-time status updates
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TestTube,
  Send,
  ArrowRight,
  CheckSquare,
  XCircle,
  Clock,
  Wifi,
  MessageSquare,
  Cpu,
  Database,
  Network,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

interface MessageFlowTest {
  id: string;
  stage: string;
  status: 'pending' | 'success' | 'error' | 'running';
  message?: string;
  timestamp?: number;
  data?: any;
}

interface MessageFlowTestProps {
  isOpen: boolean;
  onClose: () => void;
  integrationService?: any;
  className?: string;
}

export default function MessageFlowTest({ 
  isOpen, 
  onClose, 
  integrationService,
  className 
}: MessageFlowTestProps) {
  const [testResults, setTestResults] = useState<MessageFlowTest[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [testMessage, setTestMessage] = useState('calculate 2+2');
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [receivedMessages, setReceivedMessages] = useState<any[]>([]);

  // Test stages in order
  const testStages = [
    { id: 'ui_input', name: 'UI Input Processing', icon: MessageSquare },
    { id: 'service_init', name: 'Service Initialization', icon: Cpu },
    { id: 'ws_connect', name: 'WebSocket Connection', icon: Wifi },
    { id: 'message_send', name: 'Message to Stream Handler', icon: Send },
    { id: 'stream_handler', name: 'Stream Handler Processing', icon: Database },
    { id: 'tool_execution', name: 'Tool Execution', icon: Network },
    { id: 'response_received', name: 'Response Received', icon: CheckSquare }
  ];

  useEffect(() => {
    if (isOpen) {
      initializeTest();
    }
    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
    };
  }, [isOpen]);

  const initializeTest = () => {
    setTestResults([]);
    setReceivedMessages([]);
    
    // Initialize all stages as pending
    const initialResults = testStages.map(stage => ({
      id: stage.id,
      stage: stage.name,
      status: 'pending' as const,
      timestamp: Date.now()
    }));
    
    setTestResults(initialResults);
  };

  const updateTestStage = (stageId: string, status: 'success' | 'error' | 'running', message?: string, data?: any) => {
    setTestResults(prev => prev.map(test => 
      test.id === stageId 
        ? { ...test, status, message, data, timestamp: Date.now() }
        : test
    ));
  };

  const runMessageFlowTest = async () => {
    if (isRunning) return;
    
    setIsRunning(true);
    initializeTest();

    try {
      // Stage 1: UI Input Processing
      updateTestStage('ui_input', 'running', 'Processing user input...');
      await new Promise(resolve => setTimeout(resolve, 500));
      updateTestStage('ui_input', 'success', `Input: "${testMessage}"`);

      // Stage 2: Service Initialization
      updateTestStage('service_init', 'running', 'Initializing integration service...');
      
      if (!integrationService) {
        updateTestStage('service_init', 'error', 'Integration service not available - check if tools are enabled and OllamaService is running');
        setIsRunning(false);
        return;
      }

      try {
        const serviceState = integrationService.getState();
        if (!serviceState.isInitialized) {
          updateTestStage('service_init', 'running', 'Service initializing...');
          // Wait a bit for initialization
          await new Promise(resolve => setTimeout(resolve, 2000));
          const newState = integrationService.getState();
          if (!newState.isInitialized) {
            updateTestStage('service_init', 'error', 'Service failed to initialize - check console for errors');
            setIsRunning(false);
            return;
          }
        }
        updateTestStage('service_init', 'success', `Service initialized: ${serviceState.isInitialized}`, serviceState);
      } catch (error) {
        updateTestStage('service_init', 'error', `Service error: ${error}`);
        setIsRunning(false);
        return;
      }

      // Stage 3: WebSocket Connection Test
      updateTestStage('ws_connect', 'running', 'Testing WebSocket connection...');
      
      try {
        const ws = new WebSocket('ws://localhost:3000');
        setWsConnection(ws);

        ws.onopen = () => {
          updateTestStage('ws_connect', 'success', 'Connected to Stream Handler');
          
          // Stage 4: Send Message
          updateTestStage('message_send', 'running', 'Sending message to Stream Handler...');
          
          const testMsg = {
            type: 'ally_intent',
            source: 'ally_glass_pip_chat_test',
            intent: testMessage,
            slots: {},
            confidence: 1.0,
            context: {
              conversationId: 'test_conversation',
              timestamp: Date.now(),
              testMode: true
            },
            'msg-sent-timestamp': new Date().toISOString()
          };
          
          ws.send(JSON.stringify(testMsg));
          updateTestStage('message_send', 'success', 'Message sent to Stream Handler', testMsg);
          
          // Stage 5: Wait for Stream Handler processing
          updateTestStage('stream_handler', 'running', 'Waiting for Stream Handler response...');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            setReceivedMessages(prev => [...prev, { ...message, received_at: Date.now() }]);
            
            updateTestStage('stream_handler', 'success', 'Stream Handler responded', message);
            
            // Stage 6: Check for tool execution
            if (message.type === 'tool_call' || message.type === 'tool_result') {
              updateTestStage('tool_execution', 'success', `Tool ${message.type} received`, message);
            } else {
              updateTestStage('tool_execution', 'running', 'Waiting for tool execution...');
            }
            
            // Stage 7: Response received
            updateTestStage('response_received', 'success', 'Full response cycle completed', message);
          } catch (error) {
            updateTestStage('stream_handler', 'error', `Error parsing response: ${error}`);
          }
        };

        ws.onerror = (error) => {
          updateTestStage('ws_connect', 'error', 'WebSocket connection failed');
          updateTestStage('message_send', 'error', 'Cannot send - connection failed');
        };

        ws.onclose = () => {
          console.log('WebSocket connection closed');
        };

        // Timeout for connection
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            updateTestStage('ws_connect', 'error', 'Connection timeout - is Stream Handler running?');
            ws.close();
          }
        }, 5000);

      } catch (error) {
        updateTestStage('ws_connect', 'error', `Connection error: ${error}`);
      }

    } catch (error) {
      console.error('Test error:', error);
    } finally {
      setTimeout(() => setIsRunning(false), 1000);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running': return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'border-green-500 bg-green-50';
      case 'error': return 'border-red-500 bg-red-50';
      case 'running': return 'border-blue-500 bg-blue-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4",
          className
        )}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <TestTube className="w-6 h-6 text-blue-600" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Message Flow Test</h2>
                <p className="text-sm text-gray-600">Verify Glass Chat → Stream Handler integration</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <XCircle className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {/* Test Controls */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Test Message
                  </label>
                  <input
                    type="text"
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter test message..."
                    disabled={isRunning}
                  />
                </div>
                <button
                  onClick={runMessageFlowTest}
                  disabled={isRunning}
                  className={cn(
                    "px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
                    isRunning
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  {isRunning ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run Test
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Test Stages */}
            <div className="space-y-4 mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Integration Pipeline</h3>
              
              {testStages.map((stage, index) => {
                const result = testResults.find(r => r.id === stage.id);
                const Icon = stage.icon;
                
                return (
                  <div key={stage.id} className="flex items-start gap-4">
                    {/* Stage Number */}
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                      result?.status === 'success' ? 'bg-green-100 text-green-700' :
                      result?.status === 'error' ? 'bg-red-100 text-red-700' :
                      result?.status === 'running' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-500'
                    )}>
                      {index + 1}
                    </div>

                    {/* Stage Content */}
                    <div className={cn(
                      "flex-1 p-4 rounded-lg border-2 transition-all",
                      result ? getStatusColor(result.status) : 'border-gray-200 bg-white'
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-5 h-5 text-gray-600" />
                          <span className="font-medium text-gray-900">{stage.name}</span>
                        </div>
                        {result && getStatusIcon(result.status)}
                      </div>
                      
                      {result?.message && (
                        <p className="text-sm text-gray-600 mb-2">{result.message}</p>
                      )}
                      
                      {result?.data && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                            View Data
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>

                    {/* Arrow */}
                    {index < testStages.length - 1 && (
                      <ArrowRight className="w-5 h-5 text-gray-400 mt-6" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Received Messages */}
            {receivedMessages.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Received Messages ({receivedMessages.length})
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {receivedMessages.map((msg, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-gray-900">
                          {msg.type || 'Unknown Type'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.received_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <pre className="text-xs text-gray-600 overflow-x-auto">
                        {JSON.stringify(msg, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Debug Information */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Debug Information</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <div>Integration Service: {integrationService ? '✅ Available' : '❌ Not Available'}</div>
                {integrationService && (
                  <>
                    <div>Service State: {JSON.stringify(integrationService.getState?.() || 'No getState method')}</div>
                    <div>Available Tools: {integrationService.getAvailableTools?.()?.join(', ') || 'None'}</div>
                  </>
                )}
                <div>Window.pip.ollama: {window.pip?.ollama ? '✅ Available' : '❌ Not Available'}</div>
              </div>
            </div>

            {/* Instructions */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">How to Use This Test</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Make sure Stream Handler is running on localhost:3000</li>
                <li>• Make sure tools are enabled (toggle in Glass Chat)</li>
                <li>• Enter a test message (try "calculate 2+2" or "what time is it?")</li>
                <li>• Click "Run Test" to trace the message through the entire pipeline</li>
                <li>• Watch each stage turn green ✅ if successful or red ❌ if there's an issue</li>
                <li>• Check "Received Messages" to see actual responses from Stream Handler</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}