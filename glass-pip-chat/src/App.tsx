import { useEffect, useState } from 'react';
import GlassChatPiP from './components/GlassChatPiP';
import { UnifiedIntegrationTest } from './components/UnifiedIntegrationTest';
import { GrammarlyFix, suppressExtensionWarnings } from './components/GrammarlyFix';
import { ProviderTest } from './components/ProviderTest';

export default function App() {
  const [visible, setVisible] = useState(true);
  const [showIntegrationTest, setShowIntegrationTest] = useState(false);
  const [showProviderTest, setShowProviderTest] = useState(false);

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
      
      // Handle Ctrl+Shift+P to toggle Provider test
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowProviderTest(!showProviderTest);
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
  }, [visible, showIntegrationTest, showProviderTest]);

  // Check URL for different modes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test') === 'integration') {
      setShowIntegrationTest(true);
    }
    if (urlParams.get('test') === 'provider') {
      setShowProviderTest(true);
    }
  }, []);

  if (showProviderTest) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="fixed top-4 right-4 z-50 flex gap-2">
          <button
            onClick={() => setShowProviderTest(false)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Back to Chat
          </button>
        </div>
        <ProviderTest />
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