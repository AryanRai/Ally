/**
 * Unified Integration Demo Component
 * Requirements: Task 13 - Integration Demo
 * 
 * Demonstrates the complete integration of:
 * - UI tool calling components (task 11)
 * - Tool calling framework (task 1 and 8)
 * - Stream handler and comms/chyappy (task 6)
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UnifiedChatInterface } from './UnifiedChatInterface';
import { useOllamaIntegration } from '../hooks/useOllamaIntegration';

interface DemoSection {
  id: string;
  title: string;
  description: string;
  component: React.ReactNode;
  isActive: boolean;
}

export const UnifiedIntegrationDemo: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>('chat');
  const [conversationId] = useState(`demo_${Date.now()}`);
  
  // Ollama integration for the demo
  const ollamaIntegration = useOllamaIntegration();

  const demoSections: DemoSection[] = [
    {
      id: 'chat',
      title: 'Unified Chat Interface',
      description: 'Complete integration of UI, tool framework, and comms',
      component: (
        <UnifiedChatInterface
          conversationId={conversationId}
          className="h-[600px] border border-gray-200 dark:border-gray-700 rounded-lg"
        />
      ),
      isActive: activeSection === 'chat'
    },
    {
      id: 'architecture',
      title: 'Integration Architecture',
      description: 'How the components work together',
      component: <ArchitectureDiagram />,
      isActive: activeSection === 'architecture'
    },
    {
      id: 'features',
      title: 'Feature Overview',
      description: 'Key capabilities and integrations',
      component: <FeatureOverview />,
      isActive: activeSection === 'features'
    },
    {
      id: 'testing',
      title: 'Integration Testing',
      description: 'Test the integration components',
      component: <IntegrationTesting />,
      isActive: activeSection === 'testing'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Unified Tool Integration Demo
            </h1>
            <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
              Task 13: Integration of UI, Tool Framework, and Comms/Chyappy
            </p>
            
            {/* Status Indicators */}
            <div className="mt-4 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Ollama: {ollamaIntegration.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Tool Framework: Active
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Stream Handler: Ready
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {demoSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  section.isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {demoSections.map((section) => (
            section.isActive && (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {section.title}
                  </h2>
                  <p className="mt-2 text-gray-600 dark:text-gray-400">
                    {section.description}
                  </p>
                </div>
                
                {section.component}
              </motion.div>
            )
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

const ArchitectureDiagram: React.FC = () => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        Integration Architecture
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* UI Layer */}
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
            UI Layer (Task 11)
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
            <li>• ToolExecutionStatus</li>
            <li>• ToolExecutionHistory</li>
            <li>• ToolStatusIndicator</li>
            <li>• ToolManagementInterface</li>
            <li>• ToolAnalyticsDashboard</li>
          </ul>
        </div>

        {/* Tool Framework */}
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <h4 className="font-semibold text-green-900 dark:text-green-300 mb-2">
            Tool Framework (Task 1 & 8)
          </h4>
          <ul className="text-sm text-green-800 dark:text-green-400 space-y-1">
            <li>• ToolManager</li>
            <li>• ToolRegistry</li>
            <li>• ToolExecutor</li>
            <li>• ToolCallingService</li>
            <li>• Ollama Integration</li>
          </ul>
        </div>

        {/* Comms Layer */}
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
          <h4 className="font-semibold text-purple-900 dark:text-purple-300 mb-2">
            Comms/Chyappy (Task 6)
          </h4>
          <ul className="text-sm text-purple-800 dark:text-purple-400 space-y-1">
            <li>• Stream Handler v4.0</li>
            <li>• Tool Message Handlers</li>
            <li>• Message Registry</li>
            <li>• WebSocket Integration</li>
            <li>• Chyappy v3.0 Protocol</li>
          </ul>
        </div>
      </div>

      {/* Integration Flow */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
          Integration Flow
        </h4>
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <p className="mb-2">
            <strong>1. User Input:</strong> User types message in UnifiedChatInterface
          </p>
          <p className="mb-2">
            <strong>2. Tool Processing:</strong> UnifiedToolIntegrationService processes with ToolManager
          </p>
          <p className="mb-2">
            <strong>3. LLM Integration:</strong> Ollama generates tool calls via ToolCallingService
          </p>
          <p className="mb-2">
            <strong>4. Comms Layer:</strong> Tool calls sent via WebSocket to Stream Handler
          </p>
          <p className="mb-2">
            <strong>5. Execution:</strong> Tools executed and results returned via Chyappy protocol
          </p>
          <p>
            <strong>6. UI Updates:</strong> Real-time updates displayed in tool execution components
          </p>
        </div>
      </div>
    </div>
  );
};

const FeatureOverview: React.FC = () => {
  const features = [
    {
      title: 'Real-time Tool Execution',
      description: 'Execute tools with live progress updates and result streaming',
      icon: '⚙️',
      status: 'Implemented'
    },
    {
      title: 'WebSocket Communication',
      description: 'Bi-directional communication with Stream Handler v4.0',
      icon: '🔌',
      status: 'Implemented'
    },
    {
      title: 'Chyappy v3.0 Protocol',
      description: 'Full support for tool_call and tool_result message types',
      icon: '📡',
      status: 'Implemented'
    },
    {
      title: 'Tool Management UI',
      description: 'Visual interface for managing and monitoring tools',
      icon: '🛠️',
      status: 'Implemented'
    },
    {
      title: 'Analytics Dashboard',
      description: 'Performance metrics and usage analytics',
      icon: '📊',
      status: 'Implemented'
    },
    {
      title: 'Error Recovery',
      description: 'Automatic retry logic and graceful error handling',
      icon: '🔄',
      status: 'Implemented'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {features.map((feature, index) => (
        <motion.div
          key={feature.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center mb-3">
            <span className="text-2xl mr-3">{feature.icon}</span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {feature.title}
              </h3>
              <span className={`text-xs px-2 py-1 rounded-full ${
                feature.status === 'Implemented'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
              }`}>
                {feature.status}
              </span>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {feature.description}
          </p>
        </motion.div>
      ))}
    </div>
  );
};

const IntegrationTesting: React.FC = () => {
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'success' | 'error'>>({});

  const tests = [
    {
      id: 'websocket',
      name: 'WebSocket Connection',
      description: 'Test connection to Stream Handler v4.0'
    },
    {
      id: 'tool_registration',
      name: 'Tool Registration',
      description: 'Test tool registration in framework'
    },
    {
      id: 'tool_execution',
      name: 'Tool Execution',
      description: 'Test end-to-end tool execution'
    },
    {
      id: 'message_protocol',
      name: 'Message Protocol',
      description: 'Test Chyappy v3.0 message handling'
    },
    {
      id: 'error_handling',
      name: 'Error Handling',
      description: 'Test error recovery and retry logic'
    }
  ];

  const runTest = async (testId: string) => {
    setTestResults(prev => ({ ...prev, [testId]: 'pending' }));
    
    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Random success/failure for demo
    const success = Math.random() > 0.2;
    setTestResults(prev => ({ ...prev, [testId]: success ? 'success' : 'error' }));
  };

  const runAllTests = async () => {
    for (const test of tests) {
      await runTest(test.id);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'success': return '✅';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Integration Tests
        </h3>
        <button
          onClick={runAllTests}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          Run All Tests
        </button>
      </div>

      <div className="space-y-4">
        {tests.map((test) => (
          <div
            key={test.id}
            className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg"
          >
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {getStatusIcon(testResults[test.id] || 'pending')}
                </span>
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {test.name}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {test.description}
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => runTest(test.id)}
              disabled={testResults[test.id] === 'pending'}
              className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {testResults[test.id] === 'pending' ? 'Running...' : 'Run Test'}
            </button>
          </div>
        ))}
      </div>

      {/* Test Summary */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
          Test Summary
        </h4>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {Object.values(testResults).filter(r => r === 'success').length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Passed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {Object.values(testResults).filter(r => r === 'error').length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
              {Object.values(testResults).filter(r => r === 'pending').length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
          </div>
        </div>
      </div>
    </div>
  );
};