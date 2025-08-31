import { useEffect, useState } from 'react';
import GlassChatPiP from './components/GlassChatPiP';
import { UnifiedIntegrationTest } from './components/UnifiedIntegrationTest';

export default function App() {
  const [visible, setVisible] = useState(true);
  const [showIntegrationTest, setShowIntegrationTest] = useState(false);

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
  }, [visible, showIntegrationTest]);

  // Check URL for integration test mode
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test') === 'integration') {
      setShowIntegrationTest(true);
    }
  }, []);

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
      {visible && <GlassChatPiP />}
      
      {/* Integration Test Toggle Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setShowIntegrationTest(true)}
          className="px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm shadow-lg"
          title="Open Unified Integration Test (Ctrl+Shift+I)"
        >
          🚀 Test Integration
        </button>
      </div>
    </div>
  );
}