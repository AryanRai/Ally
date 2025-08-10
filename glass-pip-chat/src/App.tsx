import { useEffect, useState } from 'react';
import GlassChatPiP from './components/GlassChatPiP';

export default function App() {
  const [visible, setVisible] = useState(true);

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
  }, [visible]);

  return (
    <div className="min-h-screen bg-transparent">
      {visible && <GlassChatPiP />}
    </div>
  );
}