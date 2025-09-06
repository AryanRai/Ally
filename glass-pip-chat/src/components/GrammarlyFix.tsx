/**
 * Grammarly Extension Conflict Fix
 * 
 * This component handles conflicts with browser extensions like Grammarly
 * that inject attributes into the DOM and cause hydration warnings
 */

import { useEffect } from 'react';

export const GrammarlyFix: React.FC = () => {
  useEffect(() => {
    // Remove Grammarly attributes that cause hydration issues
    const removeGrammarlyAttributes = () => {
      const body = document.body;
      const html = document.documentElement;
      
      // List of Grammarly attributes that cause issues
      const grammarlyAttributes = [
        'data-new-gr-c-s-check-loaded',
        'data-gr-ext-installed',
        'data-new-gr-c-s-loaded',
        'data-gr-c-s-loaded'
      ];
      
      grammarlyAttributes.forEach(attr => {
        if (body.hasAttribute(attr)) {
          body.removeAttribute(attr);
        }
        if (html.hasAttribute(attr)) {
          html.removeAttribute(attr);
        }
      });
    };

    // Run immediately
    removeGrammarlyAttributes();
    
    // Run after a short delay to catch late injections
    const timeout = setTimeout(removeGrammarlyAttributes, 100);
    
    // Set up a mutation observer to catch future injections
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target as Element;
          const attrName = mutation.attributeName;
          
          if (attrName && (
            attrName.startsWith('data-gr-') || 
            attrName.startsWith('data-new-gr-')
          )) {
            target.removeAttribute(attrName);
          }
        }
      });
    });
    
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [
        'data-new-gr-c-s-check-loaded',
        'data-gr-ext-installed',
        'data-new-gr-c-s-loaded',
        'data-gr-c-s-loaded'
      ]
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-new-gr-c-s-check-loaded',
        'data-gr-ext-installed',
        'data-new-gr-c-s-loaded',
        'data-gr-c-s-loaded'
      ]
    });

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  return null; // This component doesn't render anything
};

/**
 * Utility function to suppress hydration warnings for known extension conflicts
 */
export const suppressExtensionWarnings = () => {
  if (typeof window !== 'undefined') {
    const originalError = console.error;
    console.error = (...args) => {
      const message = args[0];
      
      // Suppress specific Grammarly-related warnings
      if (typeof message === 'string' && (
        message.includes('Extra attributes from the server') ||
        message.includes('data-new-gr-c-s-check-loaded') ||
        message.includes('data-gr-ext-installed')
      )) {
        return; // Don't log these warnings
      }
      
      // Log all other errors normally
      originalError.apply(console, args);
    };
  }
};