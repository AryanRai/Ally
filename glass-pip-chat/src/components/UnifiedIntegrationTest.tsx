/**
 * Simple Test Component for Unified Integration
 * This component can be used to quickly test the unified integration
 */

import React from 'react';
import { UnifiedIntegrationDemo } from './UnifiedIntegrationDemo';

export const UnifiedIntegrationTest: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            🚀 Unified Tool Integration Test
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Task 13 Complete Integration Demo
          </p>
          <div className="mt-4 p-4 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              This demo showcases the complete integration of UI components, tool calling framework, and comms/chyappy system.
            </p>
          </div>
        </div>
        
        <UnifiedIntegrationDemo />
      </div>
    </div>
  );
};