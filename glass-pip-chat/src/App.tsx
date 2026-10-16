import { useEffect } from 'react';
import GlassChatPiP from './components/GlassChatPiP';
import { GrammarlyFix, suppressExtensionWarnings } from './components/GrammarlyFix';

export default function App() {
  useEffect(() => {
    suppressExtensionWarnings();
  }, []);

  return (
    <div className="bg-transparent min-h-screen">
      <GrammarlyFix />
      <GlassChatPiP />
    </div>
  );
}
