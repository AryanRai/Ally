/**
 * Adaptive Chat Interface
 * 
 * A wrapper component that can switch between the original GlassChatPiP
 * interface and the new LangChain-enhanced interface based on user preference.
 */

import React, { useState, useEffect } from 'react';
import { LangChainChatInterface } from './chat/LangChainChatInterface';
import { LangChainToggle } from './LangChainToggle';

interface AdaptiveChatInterfaceProps {
  // Props that would be passed to the original interface
  children?: React.ReactNode;
  className?: string;
  sessionId?: string;
  userId?: string;
}

export const AdaptiveChatInterface: React.FC<AdaptiveChatInterfaceProps> = ({
  children,
  className = '',
  sessionId,
  userId
}) => {
  const [useLangChain, setUseLangChain] = useState(false);

  // Load preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ally-use-langchain');
    if (saved !== null) {
      setUseLangChain(JSON.parse(saved));
    }
  }, []);

  // Save preference to localStorage
  useEffect(() => {
    localStorage.setItem('ally-use-langchain', JSON.stringify(useLangChain));
  }, [useLangChain]);

  if (useLangChain) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {/* Toggle in header */}
        <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Enhanced Tool Calling Active
          </div>
          <LangChainToggle
            enabled={useLangChain}
            onToggle={setUseLangChain}
          />
        </div>
        
        {/* LangChain Interface */}
        <LangChainChatInterface
          className="flex-1"
          sessionId={sessionId}
          userId={userId}
        />
      </div>
    );
  }

  // Return original interface with toggle
  return (
    <div className={`relative ${className}`}>
      {/* Floating toggle button */}
      <div className="absolute top-2 right-2 z-50">
        <LangChainToggle
          enabled={useLangChain}
          onToggle={setUseLangChain}
          className="shadow-lg"
        />
      </div>
      
      {/* Original interface */}
      {children}
    </div>
  );
};