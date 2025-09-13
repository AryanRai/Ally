/**
 * LangChain Integration Test Component
 * 
 * Simple test interface to verify LangChain functionality
 */

import React, { useState } from 'react';
import { Play, CheckCircle, XCircle, Loader } from 'lucide-react';
import { LangChainService } from '../services/langchainService';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  duration?: number;
}

export const LangChainTest: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const tests = [
    {
      name: 'Service Initialization',
      test: async () => {
        const service = new LangChainService();
        return 'LangChain service initialized successfully';
      }
    },
    {
      name: 'Tool Loading',
      test: async () => {
        const service = new LangChainService();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for async initialization
        const tools = service.getAvailableTools();
        return `Loaded ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`;
      }
    },
    {
      name: 'Tool Testing',
      test: async () => {
        const service = new LangChainService();
        await new Promise(resolve => setTimeout(resolve, 1000));
        const testResults = await service.testTools();
        return `Working tools: ${testResults.working.length}, Failed: ${testResults.failed.length}`;
      }
    },
    {
      name: 'Basic Chat',
      test: async () => {
        const service = new LangChainService();
        const response = await service.chat('Hello, can you tell me the current time?');
        return `Response received: ${response.response.substring(0, 100)}...`;
      }
    },
    {
      name: 'Tool-Assisted Chat',
      test: async () => {
        const service = new LangChainService();
        const response = await service.chat('What is 15 * 23 + 7?');
        return `Tool execution completed in ${response.executionTime}ms with ${response.totalSteps} steps`;
      }
    }
  ];

  const runTests = async () => {
    setIsRunning(true);
    setResults([]);

    for (const test of tests) {
      const startTime = Date.now();
      
      // Add pending result
      setResults(prev => [...prev, {
        name: test.name,
        status: 'running',
        message: 'Running...'
      }]);

      try {
        const message = await test.test();
        const duration = Date.now() - startTime;
        
        // Update with success
        setResults(prev => prev.map(r => 
          r.name === test.name 
            ? { ...r, status: 'success', message, duration }
            : r
        ));
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Update with error
        setResults(prev => prev.map(r => 
          r.name === test.name 
            ? { 
                ...r, 
                status: 'error', 
                message: error instanceof Error ? error.message : 'Unknown error',
                duration 
              }
            : r
        ));
      }
    }

    setIsRunning(false);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return <Loader className="w-4 h-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-300" />;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">LangChain Integration Test</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Test the LangChain integration functionality and tool availability.
        </p>
      </div>

      <div className="mb-6">
        <button
          onClick={runTests}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4" />
          {isRunning ? 'Running Tests...' : 'Run Tests'}
        </button>
      </div>

      <div className="space-y-4">
        {results.map((result, index) => (
          <div
            key={index}
            className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="flex items-center gap-3 mb-2">
              {getStatusIcon(result.status)}
              <h3 className="font-semibold">{result.name}</h3>
              {result.duration && (
                <span className="text-sm text-gray-500">
                  ({result.duration}ms)
                </span>
              )}
            </div>
            
            <p className={`text-sm ${
              result.status === 'error' 
                ? 'text-red-600 dark:text-red-400' 
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              {result.message}
            </p>
          </div>
        ))}
      </div>

      {results.length === 0 && !isRunning && (
        <div className="text-center py-8 text-gray-500">
          Click "Run Tests" to start testing the LangChain integration.
        </div>
      )}

      {results.length > 0 && !isRunning && (
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-2">Test Summary</h3>
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">
              ✓ Passed: {results.filter(r => r.status === 'success').length}
            </span>
            <span className="text-red-600">
              ✗ Failed: {results.filter(r => r.status === 'error').length}
            </span>
            <span className="text-gray-600">
              Total: {results.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};