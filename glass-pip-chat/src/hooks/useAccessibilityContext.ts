/**
 * React hook for accessibility context monitoring
 * 
 * Provides real-time context from screen reader, text selection,
 * hover events, and other accessibility sources.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AccessibilityService, AccessibilityContext, getAccessibilityService } from '../services/accessibilityService';

export interface UseAccessibilityContextOptions {
  enableTextSelection?: boolean;
  enableHoverDetection?: boolean;
  enableScreenReading?: boolean;
  enableFullScreenCapture?: boolean;
  pollingInterval?: number;
  autoStart?: boolean;
}

export interface UseAccessibilityContextReturn {
  // Current context
  context: AccessibilityContext | null;
  
  // Context components
  selectedText: string | null;
  hoveredElement: AccessibilityContext['hoveredElement'] | null;
  focusedElement: AccessibilityContext['focusedElement'] | null;
  activeWindow: AccessibilityContext['activeWindow'] | null;
  screenContent: AccessibilityContext['screenContent'] | null;
  
  // Service control
  isRunning: boolean;
  start: () => Promise<void>;
  stop: () => void;
  
  // Context utilities
  getContextSummary: () => string;
  getRecentSelections: (timeWindowMs?: number) => string[];
  hasRecentContext: () => boolean;
  
  // Context for chat
  getChatContext: () => string;
  includeContextInMessage: boolean;
  setIncludeContextInMessage: (include: boolean) => void;
  
  // Error handling
  error: string | null;
}

export function useAccessibilityContext(
  options: UseAccessibilityContextOptions = {}
): UseAccessibilityContextReturn {
  const {
    enableTextSelection = true,
    enableHoverDetection = true,
    enableScreenReading = true,
    enableFullScreenCapture = false,
    pollingInterval = 500,
    autoStart = true
  } = options;

  // State
  const [context, setContext] = useState<AccessibilityContext | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeContextInMessage, setIncludeContextInMessage] = useState(false);

  // Service reference
  const serviceRef = useRef<AccessibilityService | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = getAccessibilityService({
      enableTextSelection,
      enableHoverDetection,
      enableScreenReading,
      enableFullScreenCapture,
      pollingInterval
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (serviceRef.current) {
        serviceRef.current.stop();
      }
    };
  }, [enableTextSelection, enableHoverDetection, enableScreenReading, enableFullScreenCapture, pollingInterval]);

  // Start service
  const start = useCallback(async () => {
    if (!serviceRef.current || isRunning) return;

    try {
      setError(null);
      
      // Subscribe to context changes
      unsubscribeRef.current = serviceRef.current.onContextChange((newContext) => {
        setContext(newContext);
      });

      // Start the service
      await serviceRef.current.start();
      setIsRunning(true);
      
      console.log('✅ Accessibility context monitoring started');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('❌ Failed to start accessibility context monitoring:', err);
    }
  }, [isRunning]);

  // Stop service
  const stop = useCallback(() => {
    if (!serviceRef.current || !isRunning) return;

    try {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      serviceRef.current.stop();
      setIsRunning(false);
      setContext(null);
      
      console.log('🛑 Accessibility context monitoring stopped');
    } catch (err) {
      console.error('Error stopping accessibility context monitoring:', err);
    }
  }, [isRunning]);

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && !isRunning && serviceRef.current) {
      start();
    }
  }, [autoStart, isRunning, start]);

  // Context utilities
  const getContextSummary = useCallback((): string => {
    if (!serviceRef.current) return 'Service not available';
    return serviceRef.current.getContextSummary();
  }, []);

  const getRecentSelections = useCallback((timeWindowMs: number = 30000): string[] => {
    if (!serviceRef.current) return [];
    return serviceRef.current.getRecentSelectedText(timeWindowMs);
  }, []);

  const hasRecentContext = useCallback((): boolean => {
    if (!context) return false;
    
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return context.timestamp > fiveMinutesAgo && (
      !!context.selectedText ||
      !!context.hoveredElement?.text ||
      !!context.focusedElement?.text
    );
  }, [context]);

  const getChatContext = useCallback((): string => {
    if (!context || !includeContextInMessage) return '';

    const contextParts: string[] = [];

    // Add active window context
    if (context.activeWindow) {
      contextParts.push(`Currently in: ${context.activeWindow.application} - ${context.activeWindow.title}`);
      if (context.activeWindow.url) {
        contextParts.push(`URL: ${context.activeWindow.url}`);
      }
    }

    // Add selected text
    if (context.selectedText) {
      contextParts.push(`Selected text: "${context.selectedText}"`);
    }

    // Add hovered element context
    if (context.hoveredElement?.text) {
      contextParts.push(`Hovering over: ${context.hoveredElement.role} with text "${context.hoveredElement.text}"`);
      if (context.hoveredElement.description) {
        contextParts.push(`Description: ${context.hoveredElement.description}`);
      }
    }

    // Add focused element context
    if (context.focusedElement?.text && context.focusedElement.text !== context.selectedText) {
      contextParts.push(`Focused on: ${context.focusedElement.role} with text "${context.focusedElement.text}"`);
    }

    // Add recent selections
    const recentSelections = getRecentSelections(60000); // Last minute
    if (recentSelections.length > 1) {
      const otherSelections = recentSelections.filter(sel => sel !== context.selectedText).slice(0, 3);
      if (otherSelections.length > 0) {
        contextParts.push(`Recent selections: ${otherSelections.map(sel => `"${sel.substring(0, 50)}${sel.length > 50 ? '...' : ''}"`).join(', ')}`);
      }
    }

    return contextParts.length > 0 ? `Context: ${contextParts.join(' | ')}` : '';
  }, [context, includeContextInMessage, getRecentSelections]);

  // Derived state
  const selectedText = context?.selectedText || null;
  const hoveredElement = context?.hoveredElement || null;
  const focusedElement = context?.focusedElement || null;
  const activeWindow = context?.activeWindow || null;
  const screenContent = context?.screenContent || null;

  return {
    // Current context
    context,
    
    // Context components
    selectedText,
    hoveredElement,
    focusedElement,
    activeWindow,
    screenContent,
    
    // Service control
    isRunning,
    start,
    stop,
    
    // Context utilities
    getContextSummary,
    getRecentSelections,
    hasRecentContext,
    
    // Context for chat
    getChatContext,
    includeContextInMessage,
    setIncludeContextInMessage,
    
    // Error handling
    error
  };
}