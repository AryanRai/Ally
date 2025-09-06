/**
 * Grammarly Extension Conflict Fix
 * 
 * This component handles conflicts with browser extensions like Grammarly
 * that inject attributes into the DOM and cause hydration warnings
 */

import { useEffect } from 'react';

export const GrammarlyFix: React.FC = () => {
  useEffect(() => {
    // Remove extension attributes that cause hydration issues
    const removeExtensionAttributes = () => {
      const body = document.body;
      const html = document.documentElement;
      
      // List of extension attributes that cause issues
      const extensionAttributes = [
        'data-new-gr-c-s-check-loaded',
        'data-gr-ext-installed',
        'data-new-gr-c-s-loaded',
        'data-gr-c-s-loaded',
        'data-gr-c-s-check-loaded',
        'data-gr-ext-disabled',
        'data-gramm',
        'data-gramm_editor',
        'spellcheck'
      ];
      
      // Remove from body and html
      [body, html].forEach(element => {
        if (!element) return;
        
        extensionAttributes.forEach(attr => {
          if (element.hasAttribute(attr)) {
            element.removeAttribute(attr);
          }
        });
        
        // Also remove any attribute that starts with data-gr- or data-new-gr-
        Array.from(element.attributes).forEach(attr => {
          if (attr.name.startsWith('data-gr-') || attr.name.startsWith('data-new-gr-')) {
            element.removeAttribute(attr.name);
          }
        });
      });
    };

    // Run immediately
    removeExtensionAttributes();
    
    // Run multiple times to catch late injections
    const timeouts = [
      setTimeout(removeExtensionAttributes, 50),
      setTimeout(removeExtensionAttributes, 100),
      setTimeout(removeExtensionAttributes, 200),
      setTimeout(removeExtensionAttributes, 500)
    ];
    
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
      timeouts.forEach(timeout => clearTimeout(timeout));
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
    const originalWarn = console.warn;
    
    console.error = (...args) => {
      const message = args[0];
      
      // Suppress specific extension-related warnings
      if (typeof message === 'string' && (
        message.includes('Extra attributes from the server') ||
        message.includes('data-new-gr-c-s-check-loaded') ||
        message.includes('data-gr-ext-installed') ||
        message.includes('data-new-gr-c-s-loaded') ||
        message.includes('data-gr-c-s-loaded') ||
        message.includes('Warning: Extra attributes from the server')
      )) {
        return; // Don't log these warnings
      }
      
      // Log all other errors normally
      originalError.apply(console, args);
    };
    
    console.warn = (...args) => {
      const message = args[0];
      
      // Suppress extension-related warnings
      if (typeof message === 'string' && (
        message.includes('data-gr-') ||
        message.includes('data-new-gr-') ||
        message.includes('Extra attributes')
      )) {
        return; // Don't log these warnings
      }
      
      // Log all other warnings normally
      originalWarn.apply(console, args);
    };
  }
};