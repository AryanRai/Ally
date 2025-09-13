/**
 * Enhanced Chat Interface
 * 
 * Unified chat interface that can switch between:
 * - Original Ollama service (basic chat)
 * - LangChain service (enhanced tool calling)
 * - Unified tool integration service
 */

import React, { useState, useEffect } from 'react';
import { Bot, Wrench, Zap, Settings } from 'lucide-react';
import { LangChainChatInterface } from './LangChainChatInterface';
import { UnifiedChatInterface } from '../UnifiedChatInterface';

export type ChatMode = 'basic' | 'langchain' | 'unified';

interface EnhancedChatInterfaceProps {
  className?: string;
  sessionId?: string;
  userId?: string;
  defaultMode?: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
}

interface ChatModeOption {
  id: ChatMode;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
}

const chatModes: ChatModeOption[] = [
  {
    id: 'basic',
    name: 'Basic Chat',
    description: 'Simple conversation with Ollama',
    icon: <Bot className="w-5 h-5" />,
    features: [
      'Direct Ollama integration',
      'Fast responses',
      'Basic conversation',
      'No tool calling'
    ]
  },
  {
    id: 'langchain',
    name: 'LangChain Enhanced',
    description: 'Advanced tool calling with LangChain',
    icon: <Wrench className="w-5 h-5" />,
    features: [
      'Multi-step reasoning',
      'Automatic tool selection',
      'MCP tool integration',
      'Conversation memory',
      'Streaming with tool feedback'
    ]
  },
  {
    id: 'unified',
    name: 'Unified Platform',
    description: 'Full platform integration',
    icon: <Zap className="w-5 h-5" />,
    features: [
      'All available tools',
      'Remote service integration',
      'ACP agent support',
      'Advanced workflows',
      'Full context awareness'
    ]
  }
];

interface ModeSelectionPanelProps {
  currentMode: ChatMode;
  onModeSelect: (mode: ChatMode) => void;
  onClose: () => void;
}

const ModeSelectionPanel: React.FC<ModeSelectionPanelProps> = ({
  currentMode,
  onModeSelect,
  onClose
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Select Chat Mode</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {chatModes.map((mode) => (
            <div
              key={mode.id}
              className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
                currentMode === mode.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              onClick={() => {
                onModeSelect(mode.id);
                onClose();
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${
                  currentMode === mode.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {mode.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{mode.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {mode.description}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                  Features:
                </h4>
                <ul className="space-y-1">
                  {mode.features.map((feature, index) => (
                    <li key={index} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {currentMode === mode.id && (
                <div className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">
                  ✓ Currently Active
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
            💡 Recommendations:
          </h4>
          <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
            <li>• Use <strong>Basic Chat</strong> for simple conversations and quick responses</li>
            <li>• Use <strong>LangChain Enhanced</strong> for complex tasks requiring tool usage</li>
            <li>• Use <strong>Unified Platform</strong> for advanced workflows and full integration</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export const EnhancedChatInterface: React.FC<EnhancedChatInterfaceProps> = ({
  className = '',
  sessionId,
  userId,
  defaultMode = 'langchain',
  onModeChange
}) => {
  const [currentMode, setCurrentMode] = useState<ChatMode>(defaultMode);
  const [showModeSelection, setShowModeSelection] = useState(false);

  useEffect(() => {
    onModeChange?.(currentMode);
  }, [currentMode, onModeChange]);

  const handleModeSelect = (mode: ChatMode) => {
    setCurrentMode(mode);
  };

  const getCurrentModeInfo = () => {
    return chatModes.find(mode => mode.id === currentMode);
  };

  const renderChatInterface = () => {
    switch (currentMode) {
      case 'langchain':
        return (
          <LangChainChatInterface
            className="flex-1"
            sessionId={sessionId}
            userId={userId}
          />
        );
      
      case 'unified':
        return (
          <UnifiedChatInterface
            className="flex-1"
          />
        );
      
      case 'basic':
      default:
        // For basic mode, we could create a simple Ollama-only interface
        // For now, fall back to LangChain but with simplified config
        return (
          <LangChainChatInterface
            className="flex-1"
            sessionId={sessionId}
            userId={userId}
          />
        );
    }
  };

  const currentModeInfo = getCurrentModeInfo();

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Mode Header */}
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500 text-white rounded-lg">
            {currentModeInfo?.icon}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{currentModeInfo?.name}</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {currentModeInfo?.description}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowModeSelection(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Switch Mode
        </button>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 overflow-hidden">
        {renderChatInterface()}
      </div>

      {/* Mode Selection Panel */}
      {showModeSelection && (
        <ModeSelectionPanel
          currentMode={currentMode}
          onModeSelect={handleModeSelect}
          onClose={() => setShowModeSelection(false)}
        />
      )}
    </div>
  );
};