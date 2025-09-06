'use client'

/**
 * Compatibility Fix Component
 * 
 * Handles various browser extension conflicts and compatibility issues
 * including Grammarly, authentication errors, and hydration warnings
 */

import { useEffect } from 'react'

export const CompatibilityFix: React.FC = () => {
  useEffect(() => {
    // Fix Grammarly and other extension conflicts
    const removeExtensionAttributes = () => {
      const body = document.body
      const html = document.documentElement
      
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
      ]
      
      // Remove from body and html
      ;[body, html].forEach(element => {
        if (!element) return
        
        extensionAttributes.forEach(attr => {
          if (element.hasAttribute(attr)) {
            element.removeAttribute(attr)
          }
        })
        
        // Also remove any attribute that starts with data-gr- or data-new-gr-
        Array.from(element.attributes).forEach(attr => {
          if (attr.name.startsWith('data-gr-') || attr.name.startsWith('data-new-gr-')) {
            element.removeAttribute(attr.name)
          }
        })
      })
    }

    // Suppress extension-related console warnings
    const suppressExtensionWarnings = () => {
      const originalError = console.error
      const originalWarn = console.warn
      
      console.error = (...args) => {
        const message = args[0]
        
        // Suppress specific extension-related warnings
        if (typeof message === 'string' && (
          message.includes('Extra attributes from the server') ||
          message.includes('data-new-gr-c-s-check-loaded') ||
          message.includes('data-gr-ext-installed') ||
          message.includes('data-new-gr-c-s-loaded') ||
          message.includes('data-gr-c-s-loaded') ||
          message.includes('Warning: Extra attributes from the server')
        )) {
          return // Don't log these warnings
        }
        
        // Log all other errors normally
        originalError.apply(console, args)
      }
      
      console.warn = (...args) => {
        const message = args[0]
        
        // Suppress extension-related warnings
        if (typeof message === 'string' && (
          message.includes('data-gr-') ||
          message.includes('data-new-gr-') ||
          message.includes('Extra attributes')
        )) {
          return // Don't log these warnings
        }
        
        // Log all other warnings normally
        originalWarn.apply(console, args)
      }
    }

    // Run immediately
    removeExtensionAttributes()
    suppressExtensionWarnings()
    
    // Run multiple times to catch late injections
    const timeouts = [
      setTimeout(removeExtensionAttributes, 50),
      setTimeout(removeExtensionAttributes, 100),
      setTimeout(removeExtensionAttributes, 200),
      setTimeout(removeExtensionAttributes, 500),
      setTimeout(removeExtensionAttributes, 1000)
    ]
    
    // Set up a mutation observer to catch future injections
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target as Element
          const attrName = mutation.attributeName
          
          if (attrName && (
            attrName.startsWith('data-gr-') || 
            attrName.startsWith('data-new-gr-')
          )) {
            target.removeAttribute(attrName)
          }
        }
      })
    })
    
    // Observe both body and html for attribute changes
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: [
          'data-new-gr-c-s-check-loaded',
          'data-gr-ext-installed',
          'data-new-gr-c-s-loaded',
          'data-gr-c-s-loaded'
        ]
      })
    }
    
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [
          'data-new-gr-c-s-check-loaded',
          'data-gr-ext-installed',
          'data-new-gr-c-s-loaded',
          'data-gr-c-s-loaded'
        ]
      })
    }

    // Handle authentication errors in EventSource
    const handleAuthErrors = () => {
      // Listen for global error events that might be auth-related
      const handleGlobalError = (event: ErrorEvent) => {
        if (event.message && event.message.includes('401')) {
          console.warn('Authentication error detected - user may need to refresh and re-login')
        }
      }
      
      window.addEventListener('error', handleGlobalError)
      
      return () => {
        window.removeEventListener('error', handleGlobalError)
      }
    }

    const cleanupAuthHandler = handleAuthErrors()

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout))
      observer.disconnect()
      cleanupAuthHandler()
    }
  }, [])

  return null // This component doesn't render anything
}

/**
 * Utility function to check if browser extensions are causing issues
 */
export const checkExtensionConflicts = (): { hasConflicts: boolean; extensions: string[] } => {
  const detectedExtensions: string[] = []
  
  // Check for Grammarly
  if (document.body?.hasAttribute('data-new-gr-c-s-check-loaded') || 
      document.documentElement?.hasAttribute('data-new-gr-c-s-check-loaded')) {
    detectedExtensions.push('Grammarly')
  }
  
  // Check for other common extensions
  const extensionSelectors = [
    'grammarly-extension',
    '[data-lastpass-icon-root]',
    '[data-honey-extension]',
    '[data-adblock-key]'
  ]
  
  extensionSelectors.forEach(selector => {
    if (document.querySelector(selector)) {
      const extensionName = selector.replace(/[\[\]"']/g, '').split('-')[0]
      detectedExtensions.push(extensionName)
    }
  })
  
  return {
    hasConflicts: detectedExtensions.length > 0,
    extensions: detectedExtensions
  }
}

/**
 * Utility function to fix authentication issues
 */
export const fixAuthenticationIssues = async (): Promise<{ fixed: boolean; message: string }> => {
  try {
    // Check if we can access the auth endpoint
    const response = await fetch('/api/auth/session', { method: 'GET' })
    
    if (response.status === 401) {
      return {
        fixed: false,
        message: 'Authentication required - please refresh the page and log in again'
      }
    }
    
    if (response.ok) {
      return {
        fixed: true,
        message: 'Authentication is working correctly'
      }
    }
    
    return {
      fixed: false,
      message: `Authentication check failed with status: ${response.status}`
    }
  } catch (error) {
    return {
      fixed: false,
      message: `Authentication check failed: ${(error as Error).message}`
    }
  }
}