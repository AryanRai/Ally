import { useEffect, useState } from 'react';
import GlassChatPiP from './components/GlassChatPiP';
import { UnifiedIntegrationTest } from './components/UnifiedIntegrationTest';
import { GrammarlyFix, suppressExtensionWarnings } from './components/GrammarlyFix';
import { LangChainChatInterface } from './components/chat/LangChainChatInterface';
import { LangChainTest } from './components/LangChainTest';

export default function App() {
  const [visible, setVisible] = useState(true);
  const [showIntegrationTest, setShowIntegrationTest] = useState(false);
  const [showLangChainChat, setShowLangChainChat] = useState(false);
  const [showLangChainTest, setShowLangChainTest] = useState(false);

  // Suppress extension warnings on app start
  useEffect(() => {
    suppressExtensionWarnings();
  }, []);

  useEffect(() => {
    // Handle Escape key to hide window
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        setVisible(false);
        // Optionally hide the actual window
        if (window.pip) {
          window.pip.hide();
        }
      }
      
      // Handle Ctrl+Shift+I to toggle integration test
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        setShowIntegrationTest(!showIntegrationTest);
      }
      
      // Handle Ctrl+Shift+L to toggle LangChain chat
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setShowLangChainChat(!showLangChainChat);
      }
      
      // Handle Ctrl+Shift+T to toggle LangChain test
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setShowLangChainTest(!showLangChainTest);
      }
    };

    // Listen for focus input event from main process
    const unsubscribe = window.pip?.onFocusInput(() => {
      const event = new CustomEvent('focus-chat-input');
      window.dispatchEvent(event);
    });

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribe?.();
    };
  }, [visible, showIntegrationTest, showLangChainChat, showLangChainTest]);

  // Check URL for different modes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test') === 'integration') {
      setShowIntegrationTest(true);
    }
    if (urlParams.get('mode') === 'langchain') {
      setShowLangChainChat(true);
    }
    if (urlParams.get('test') === 'langchain') {
      setShowLangChainTest(true);
    }
  }, []);

  if (showLangChainTest) {
    return (
      <div className="min-h-screen">
        <div className="fixed top-4 right-4 z-50 flex gap-2">
          <button
            onClick={() => setShowLangChainTest(false)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Back to Chat
          </button>
        </div>
        <LangChainTest />
      </div>
    );
  }

  if (showLangChainChat) {
    return (
      <div className="min-h-screen">
        <div className="fixed top-4 right-4 z-50 flex gap-2">
          <button
            onClick={() => setShowLangChainChat(false)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Back to Chat
          </button>
          <button
            onClick={() => setShowLangChainTest(true)}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Test LangChain
          </button>
        </div>
        <div className="p-4">
          <LangChainChatInterface />
        </div>
      </div>
    );
  }

  if (showIntegrationTest) {
    return (
      <div className="min-h-screen">
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => setShowIntegrationTest(false)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Back to Chat
          </button>
        </div>
        <UnifiedIntegrationTest />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <GrammarlyFix />
      
      {visible && <GlassChatPiP />}
    </div>
  );
}