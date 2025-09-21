/**
 * Advanced Accessibility Service
 * 
 * Provides comprehensive context monitoring using:
 * - Windows UI Automation API
 * - Screen reader integration
 * - Text selection monitoring
 * - Element hover detection
 * - Full screen content extraction
 */

export interface AccessibilityContext {
  selectedText?: string;
  hoveredElement?: {
    text: string;
    role: string;
    name: string;
    description?: string;
    value?: string;
    bounds?: { x: number; y: number; width: number; height: number };
  };
  focusedElement?: {
    text: string;
    role: string;
    name: string;
    application: string;
    window: string;
  };
  screenContent?: {
    visibleText: string;
    elements: Array<{
      text: string;
      role: string;
      bounds: { x: number; y: number; width: number; height: number };
    }>;
  };
  activeWindow?: {
    title: string;
    application: string;
    url?: string; // For browsers
  };
  cursorPosition?: { x: number; y: number };
  timestamp: number;
}

export interface AccessibilityServiceOptions {
  enableTextSelection: boolean;
  enableHoverDetection: boolean;
  enableScreenReading: boolean;
  enableFullScreenCapture: boolean;
  pollingInterval: number; // ms
  maxContextHistory: number;
}

export class AccessibilityService {
  private options: AccessibilityServiceOptions;
  private contextHistory: AccessibilityContext[] = [];
  private listeners: Array<(context: AccessibilityContext) => void> = [];
  private isRunning = false;
  private pollingTimer?: NodeJS.Timeout;
  private lastContext?: AccessibilityContext;

  constructor(options: Partial<AccessibilityServiceOptions> = {}) {
    this.options = {
      enableTextSelection: true,
      enableHoverDetection: true,
      enableScreenReading: true,
      enableFullScreenCapture: false, // Expensive operation
      pollingInterval: 500,
      maxContextHistory: 100,
      ...options
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    console.log('🔍 Starting Accessibility Service...');
    
    try {
      // Initialize Windows APIs if available
      await this.initializeWindowsAPIs();
      
      // Start monitoring
      this.isRunning = true;
      this.startPolling();
      
      console.log('✅ Accessibility Service started successfully');
    } catch (error) {
      console.error('❌ Failed to start Accessibility Service:', error);
      throw error;
    }
  }

  stop(): void {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Accessibility Service...');
    
    this.isRunning = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    
    console.log('✅ Accessibility Service stopped');
  }

  onContextChange(listener: (context: AccessibilityContext) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getCurrentContext(): AccessibilityContext | undefined {
    return this.lastContext;
  }

  getContextHistory(): AccessibilityContext[] {
    return [...this.contextHistory];
  }

  private async initializeWindowsAPIs(): Promise<void> {
    // Check if we're in Electron with Windows APIs available
    if (typeof window !== 'undefined' && window.pip?.accessibility) {
      console.log('🪟 Windows accessibility APIs available');
      return;
    }

    // Fallback to web APIs
    console.log('🌐 Using web-based accessibility monitoring');
  }

  private startPolling(): void {
    this.pollingTimer = setInterval(async () => {
      try {
        const context = await this.captureContext();
        if (this.hasContextChanged(context)) {
          this.updateContext(context);
        }
      } catch (error) {
        console.error('Error capturing accessibility context:', error);
      }
    }, this.options.pollingInterval);
  }

  private async captureContext(): Promise<AccessibilityContext> {
    const context: AccessibilityContext = {
      timestamp: Date.now()
    };

    // Capture selected text
    if (this.options.enableTextSelection) {
      context.selectedText = await this.captureSelectedText();
    }

    // Capture hovered element
    if (this.options.enableHoverDetection) {
      context.hoveredElement = await this.captureHoveredElement();
    }

    // Capture focused element
    context.focusedElement = await this.captureFocusedElement();

    // Capture active window info
    context.activeWindow = await this.captureActiveWindow();

    // Capture cursor position
    context.cursorPosition = await this.captureCursorPosition();

    // Capture full screen content (expensive)
    if (this.options.enableFullScreenCapture) {
      context.screenContent = await this.captureScreenContent();
    }

    return context;
  }

  private async captureSelectedText(): Promise<string | undefined> {
    try {
      // Try Windows API first
      if (window.pip?.accessibility?.getSelectedText) {
        return await window.pip.accessibility.getSelectedText();
      }

      // Fallback to web selection API
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        return selection.toString().trim();
      }

      // Try clipboard as last resort (may contain recently selected text)
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText && clipboardText.length < 1000) { // Reasonable selection size
          return clipboardText;
        }
      }
    } catch (error) {
      console.debug('Could not capture selected text:', error);
    }

    return undefined;
  }

  private async captureHoveredElement(): Promise<AccessibilityContext['hoveredElement']> {
    try {
      // Try Windows UI Automation API
      if (window.pip?.accessibility?.getElementAtCursor) {
        return await window.pip.accessibility.getElementAtCursor();
      }

      // Fallback to web APIs
      const cursorPos = await this.captureCursorPosition();
      if (cursorPos) {
        const element = document.elementFromPoint(cursorPos.x, cursorPos.y);
        if (element) {
          return {
            text: element.textContent?.trim() || '',
            role: element.getAttribute('role') || element.tagName.toLowerCase(),
            name: element.getAttribute('aria-label') || element.getAttribute('title') || '',
            description: element.getAttribute('aria-description') || undefined,
            value: (element as any).value || undefined,
            bounds: element.getBoundingClientRect()
          };
        }
      }
    } catch (error) {
      console.debug('Could not capture hovered element:', error);
    }

    return undefined;
  }

  private async captureFocusedElement(): Promise<AccessibilityContext['focusedElement']> {
    try {
      // Try Windows API
      if (window.pip?.accessibility?.getFocusedElement) {
        return await window.pip.accessibility.getFocusedElement();
      }

      // Fallback to web APIs
      const activeElement = document.activeElement;
      if (activeElement && activeElement !== document.body) {
        return {
          text: activeElement.textContent?.trim() || '',
          role: activeElement.getAttribute('role') || activeElement.tagName.toLowerCase(),
          name: activeElement.getAttribute('aria-label') || activeElement.getAttribute('title') || '',
          application: 'Web Browser',
          window: document.title
        };
      }
    } catch (error) {
      console.debug('Could not capture focused element:', error);
    }

    return undefined;
  }

  private async captureActiveWindow(): Promise<AccessibilityContext['activeWindow']> {
    try {
      // Try Windows API
      if (window.pip?.accessibility?.getActiveWindow) {
        return await window.pip.accessibility.getActiveWindow();
      }

      // Fallback to web APIs
      return {
        title: document.title,
        application: 'Web Browser',
        url: window.location.href
      };
    } catch (error) {
      console.debug('Could not capture active window:', error);
    }

    return undefined;
  }

  private async captureCursorPosition(): Promise<AccessibilityContext['cursorPosition']> {
    try {
      // Try Windows API
      if (window.pip?.accessibility?.getCursorPosition) {
        return await window.pip.accessibility.getCursorPosition();
      }

      // Web APIs don't provide global cursor position
      // This would need to be tracked via mouse events
    } catch (error) {
      console.debug('Could not capture cursor position:', error);
    }

    return undefined;
  }

  private async captureScreenContent(): Promise<AccessibilityContext['screenContent']> {
    try {
      // Try Windows UI Automation API
      if (window.pip?.accessibility?.getScreenContent) {
        return await window.pip.accessibility.getScreenContent();
      }

      // Fallback: capture visible page content
      const visibleElements = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && 
                 rect.top >= 0 && rect.left >= 0 &&
                 rect.bottom <= window.innerHeight && 
                 rect.right <= window.innerWidth;
        })
        .map(el => ({
          text: el.textContent?.trim() || '',
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          bounds: el.getBoundingClientRect()
        }))
        .filter(el => el.text.length > 0);

      return {
        visibleText: visibleElements.map(el => el.text).join(' '),
        elements: visibleElements
      };
    } catch (error) {
      console.debug('Could not capture screen content:', error);
    }

    return undefined;
  }

  private hasContextChanged(newContext: AccessibilityContext): boolean {
    if (!this.lastContext) return true;

    // Check for meaningful changes
    const hasSelectedTextChanged = newContext.selectedText !== this.lastContext.selectedText;
    const hasHoveredElementChanged = JSON.stringify(newContext.hoveredElement) !== JSON.stringify(this.lastContext.hoveredElement);
    const hasFocusedElementChanged = JSON.stringify(newContext.focusedElement) !== JSON.stringify(this.lastContext.focusedElement);
    const hasActiveWindowChanged = JSON.stringify(newContext.activeWindow) !== JSON.stringify(this.lastContext.activeWindow);

    return hasSelectedTextChanged || hasHoveredElementChanged || hasFocusedElementChanged || hasActiveWindowChanged;
  }

  private updateContext(context: AccessibilityContext): void {
    this.lastContext = context;
    
    // Add to history
    this.contextHistory.push(context);
    if (this.contextHistory.length > this.options.maxContextHistory) {
      this.contextHistory.shift();
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(context);
      } catch (error) {
        console.error('Error in accessibility context listener:', error);
      }
    });
  }

  // Utility methods for context analysis
  getRecentSelectedText(timeWindowMs: number = 30000): string[] {
    const cutoff = Date.now() - timeWindowMs;
    return this.contextHistory
      .filter(ctx => ctx.timestamp > cutoff && ctx.selectedText)
      .map(ctx => ctx.selectedText!)
      .filter((text, index, array) => array.indexOf(text) === index); // Unique
  }

  getContextSummary(): string {
    const context = this.lastContext;
    if (!context) return 'No context available';

    const parts: string[] = [];

    if (context.activeWindow) {
      parts.push(`Active: ${context.activeWindow.application} - ${context.activeWindow.title}`);
    }

    if (context.selectedText) {
      parts.push(`Selected: "${context.selectedText.substring(0, 100)}${context.selectedText.length > 100 ? '...' : ''}"`);
    }

    if (context.hoveredElement?.text) {
      parts.push(`Hovering: ${context.hoveredElement.role} - "${context.hoveredElement.text.substring(0, 50)}${context.hoveredElement.text.length > 50 ? '...' : ''}"`);
    }

    if (context.focusedElement?.text) {
      parts.push(`Focused: ${context.focusedElement.role} - "${context.focusedElement.text.substring(0, 50)}${context.focusedElement.text.length > 50 ? '...' : ''}"`);
    }

    return parts.join(' | ') || 'No specific context detected';
  }
}

// Global instance
let accessibilityService: AccessibilityService | null = null;

export function getAccessibilityService(options?: Partial<AccessibilityServiceOptions>): AccessibilityService {
  if (!accessibilityService) {
    accessibilityService = new AccessibilityService(options);
  }
  return accessibilityService;
}

// Type declarations for Windows APIs
declare global {
  interface Window {
    pip?: {
      accessibility?: {
        getSelectedText(): Promise<string | undefined>;
        getElementAtCursor(): Promise<AccessibilityContext['hoveredElement']>;
        getFocusedElement(): Promise<AccessibilityContext['focusedElement']>;
        getActiveWindow(): Promise<AccessibilityContext['activeWindow']>;
        getCursorPosition(): Promise<AccessibilityContext['cursorPosition']>;
        getScreenContent(): Promise<AccessibilityContext['screenContent']>;
        connect(): Promise<{ success: boolean; error?: string }>;
        disconnect(): Promise<{ success: boolean }>;
        isConnected(): Promise<boolean>;
      };
    };
  }
}