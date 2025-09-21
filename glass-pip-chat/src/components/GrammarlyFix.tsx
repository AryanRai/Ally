/**
 * GrammarlyFix Component
 * 
 * Provides compatibility fixes for Grammarly browser extension
 * to prevent conflicts with the application.
 */

import { useEffect } from 'react';

export function GrammarlyFix() {
  useEffect(() => {
    // Suppress Grammarly extension warnings and conflicts
    suppressExtensionWarnings();
  }, []);

  return null; // This component doesn't render anything
}

export function suppressExtensionWarnings() {
  // Suppress Grammarly-related console warnings
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    const message = args.join(' ');
    if (
      message.includes('grammarly') ||
      message.includes('Grammarly') ||
      message.includes('extension') ||
      message.includes('content script')
    ) {
      // Suppress Grammarly warnings
      return;
    }
    originalConsoleWarn.apply(console, args);
  };

  // Prevent Grammarly from interfering with input elements
  const style = document.createElement('style');
  style.textContent = `
    /* Hide Grammarly elements */
    grammarly-extension,
    grammarly-popups,
    [data-grammarly-shadow-root] {
      display: none !important;
    }
    
    /* Prevent Grammarly from modifying our inputs */
    input[data-grammarly-reactwrapper],
    textarea[data-grammarly-reactwrapper] {
      outline: none !important;
    }
  `;
  document.head.appendChild(style);

  // Disable Grammarly on specific elements
  const disableGrammarly = () => {
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach((input) => {
      input.setAttribute('data-gramm', 'false');
      input.setAttribute('data-gramm_editor', 'false');
      input.setAttribute('data-enable-grammarly', 'false');
    });
  };

  // Run on DOM ready and mutations
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableGrammarly);
  } else {
    disableGrammarly();
  }

  // Watch for new elements
  const observer = new MutationObserver(() => {
    disableGrammarly();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}