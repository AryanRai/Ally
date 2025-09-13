/**
 * LangChain Toggle Component
 * 
 * Simple toggle to switch between the original chat interface
 * and the new LangChain-enhanced interface.
 */

import React from 'react';
import { Wrench, Zap } from 'lucide-react';

interface LangChainToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  className?: string;
}

export const LangChainToggle: React.FC<LangChainToggleProps> = ({
  enabled,
  onToggle,
  className = ''
}) => {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        transition-all duration-200 hover:scale-105
        ${enabled 
          ? 'bg-blue-500 text-white shadow-lg' 
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }
        ${className}
      `}
      title={enabled ? 'Switch to Basic Chat' : 'Switch to LangChain Enhanced'}
    >
      {enabled ? (
        <>
          <Wrench className="w-4 h-4" />
          <span>LangChain</span>
        </>
      ) : (
        <>
          <Zap className="w-4 h-4" />
          <span>Basic</span>
        </>
      )}
    </button>
  );
};