/**
 * Unified Error Recovery Service
 * 
 * Provides automatic error detection and recovery mechanisms
 * for both ally-remote-service and glass-pip-chat
 */

import { getUnifiedAuthService } from './unified-auth-service'
import { UnifiedError, UnifiedServiceStatus } from './shared-types'

export interface ErrorRecoveryOptions {
  maxRetries: number
  retryDelay: number
  enableAutoRecovery: boolean
  logErrors: boolean
}

export class UnifiedErrorRecoveryService {
  private errors: UnifiedError[] = []
  private recoveryAttempts: Map<string, number> = new Map()
  private options: ErrorRecoveryOptions
  private authService = getUnifiedAuthService()

  constructor(options: Partial<ErrorRecoveryOptions> = {}) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      enableAutoRecovery: true,
      logErrors: true,
      ...options
    }
  }

  /**
   * Detect and classify errors
   */
  public async detectErrors(): Promise<UnifiedError[]> {
    const detectedErrors: UnifiedError[] = []

    // Check authentication integrity
    try {
      const authCheck = await this.authService.checkAuthIntegrity()
      if (!authCheck.valid) {
        authCheck.issues.forEach(issue => {
          detectedErrors.push({
            code: 'AUTH_INTEGRITY_ISSUE',
            message: issue,
            timestamp: Date.now(),
            source: typeof window !== 'undefined' ? 'web' : 'desktop',
            details: { category: 'authentication' }
          })
        })
      }
    } catch (error) {
      detectedErrors.push({
        code: 'AUTH_CHECK_FAILED',
        message: (error as Error).message,
        timestamp: Date.now(),
        source: typeof window !== 'undefined' ? 'web' : 'desktop',
        details: { category: 'authentication' }
      })
    }

    // Check for Grammarly conflicts (web only)
    if (typeof window !== 'undefined') {
      const grammarlyConflicts = this.detectGrammarlyConflicts()
      detectedErrors.push(...grammarlyConflicts)
    }

    // Check network connectivity
    const networkErrors = await this.checkNetworkConnectivity()
    detectedErrors.push(...networkErrors)

    this.errors = [...this.errors, ...detectedErrors]
    return detectedErrors
  }

  /**
   * Automatically recover from detected errors
   */
  public async recoverFromError(error: UnifiedError): Promise<{ success: boolean; message: string }> {
    if (!this.options.enableAutoRecovery) {
      return { success: false, message: 'Auto-recovery is disabled' }
    }

    const attemptKey = `${error.code}-${error.timestamp}`
    const currentAttempts = this.recoveryAttempts.get(attemptKey) || 0

    if (currentAttempts >= this.options.maxRetries) {
      return { success: false, message: 'Max retry attempts exceeded' }
    }

    this.recoveryAttempts.set(attemptKey, currentAttempts + 1)

    try {
      switch (error.code) {
        case 'AUTH_INTEGRITY_ISSUE':
        case 'AUTH_CHECK_FAILED':
          return await this.recoverFromAuthError(error)
        
        case 'GRAMMARLY_CONFLICT':
          return await this.recoverFromGrammarlyConflict(error)
        
        case 'NETWORK_ERROR':
          return await this.recoverFromNetworkError(error)
        
        case 'STREAM_CONNECTION_FAILED':
          return await this.recoverFromStreamError(error)
        
        default:
          return { success: false, message: `No recovery strategy for error: ${error.code}` }
      }
    } catch (recoveryError) {
      if (this.options.logErrors) {
        console.error('Error recovery failed:', recoveryError)
      }
      return { success: false, message: (recoveryError as Error).message }
    }
  }

  /**
   * Recover from authentication errors
   */
  private async recoverFromAuthError(error: UnifiedError): Promise<{ success: boolean; message: string }> {
    try {
      // Try to refresh the session
      const refreshResult = await this.authService.refreshSession()
      
      if (refreshResult.success) {
        return { success: true, message: 'Authentication recovered via session refresh' }
      }

      // If refresh fails, check if we need to re-authenticate
      const authState = this.authService.getAuthState()
      if (!authState?.isAuthenticated) {
        return { 
          success: false, 
          message: 'User needs to re-authenticate - please refresh the page and log in again' 
        }
      }

      return { success: false, message: 'Authentication recovery failed' }
    } catch (error) {
      return { success: false, message: `Auth recovery error: ${(error as Error).message}` }
    }
  }

  /**
   * Recover from Grammarly conflicts
   */
  private async recoverFromGrammarlyConflict(error: UnifiedError): Promise<{ success: boolean; message: string }> {
    if (typeof window === 'undefined') {
      return { success: false, message: 'Grammarly conflicts only occur in browser environment' }
    }

    try {
      // Remove Grammarly attributes
      const extensionAttributes = [
        'data-new-gr-c-s-check-loaded',
        'data-gr-ext-installed',
        'data-new-gr-c-s-loaded',
        'data-gr-c-s-loaded'
      ]

      let removedCount = 0
      ;[document.body, document.documentElement].forEach(element => {
        if (!element) return
        
        extensionAttributes.forEach(attr => {
          if (element.hasAttribute(attr)) {
            element.removeAttribute(attr)
            removedCount++
          }
        })
      })

      // Apply CSS fixes
      const style = document.createElement('style')
      style.textContent = `
        grammarly-extension,
        grammarly-popups,
        [data-grammarly-shadow-root] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `
      document.head.appendChild(style)

      return { 
        success: true, 
        message: `Grammarly conflict resolved - removed ${removedCount} attributes and applied CSS fixes` 
      }
    } catch (error) {
      return { success: false, message: `Grammarly recovery error: ${(error as Error).message}` }
    }
  }

  /**
   * Recover from network errors
   */
  private async recoverFromNetworkError(error: UnifiedError): Promise<{ success: boolean; message: string }> {
    try {
      // Wait for the retry delay
      await new Promise(resolve => setTimeout(resolve, this.options.retryDelay))

      // Test network connectivity
      const response = await fetch('/api/health', { method: 'HEAD' })
      
      if (response.ok) {
        return { success: true, message: 'Network connectivity restored' }
      }

      return { success: false, message: `Network still unavailable (status: ${response.status})` }
    } catch (error) {
      return { success: false, message: `Network recovery error: ${(error as Error).message}` }
    }
  }

  /**
   * Recover from stream connection errors
   */
  private async recoverFromStreamError(error: UnifiedError): Promise<{ success: boolean; message: string }> {
    try {
      // Check if the stream endpoint is accessible
      const response = await fetch('/api/stream', { method: 'HEAD' })
      
      if (response.status === 401) {
        // This is an auth issue, delegate to auth recovery
        return await this.recoverFromAuthError({
          ...error,
          code: 'AUTH_INTEGRITY_ISSUE'
        })
      }

      if (response.ok) {
        return { success: true, message: 'Stream endpoint is accessible - connection should recover automatically' }
      }

      return { success: false, message: `Stream endpoint unavailable (status: ${response.status})` }
    } catch (error) {
      return { success: false, message: `Stream recovery error: ${(error as Error).message}` }
    }
  }

  /**
   * Detect Grammarly conflicts
   */
  private detectGrammarlyConflicts(): UnifiedError[] {
    const conflicts: UnifiedError[] = []

    if (typeof window === 'undefined') return conflicts

    // Check for Grammarly attributes
    const grammarlyAttributes = [
      'data-new-gr-c-s-check-loaded',
      'data-gr-ext-installed',
      'data-new-gr-c-s-loaded',
      'data-gr-c-s-loaded'
    ]

    grammarlyAttributes.forEach(attr => {
      if (document.body?.hasAttribute(attr) || document.documentElement?.hasAttribute(attr)) {
        conflicts.push({
          code: 'GRAMMARLY_CONFLICT',
          message: `Grammarly attribute detected: ${attr}`,
          timestamp: Date.now(),
          source: 'web',
          details: { attribute: attr, category: 'extension_conflict' }
        })
      }
    })

    return conflicts
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkConnectivity(): Promise<UnifiedError[]> {
    const errors: UnifiedError[] = []

    try {
      // Test basic connectivity
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        errors.push({
          code: 'NETWORK_ERROR',
          message: `Network connectivity issue (status: ${response.status})`,
          timestamp: Date.now(),
          source: typeof window !== 'undefined' ? 'web' : 'desktop',
          details: { status: response.status, category: 'network' }
        })
      }
    } catch (error) {
      errors.push({
        code: 'NETWORK_ERROR',
        message: `Network connectivity failed: ${(error as Error).message}`,
        timestamp: Date.now(),
        source: typeof window !== 'undefined' ? 'web' : 'desktop',
        details: { category: 'network' }
      })
    }

    return errors
  }

  /**
   * Get service status
   */
  public getServiceStatus(): UnifiedServiceStatus {
    const recentErrors = this.errors.filter(error => 
      Date.now() - error.timestamp < 60000 // Last minute
    )

    return {
      isRunning: true,
      connectionStatus: recentErrors.length === 0 ? 'online' : 'error',
      lastHeartbeat: Date.now(),
      activeConnections: 1,
      errors: recentErrors,
      capabilities: ['error-detection', 'auto-recovery', 'grammarly-fix', 'auth-recovery']
    }
  }

  /**
   * Clear old errors
   */
  public clearOldErrors(maxAge: number = 300000): void { // 5 minutes default
    const cutoff = Date.now() - maxAge
    this.errors = this.errors.filter(error => error.timestamp > cutoff)
    
    // Clear old recovery attempts
    for (const [key, _] of this.recoveryAttempts) {
      const timestamp = parseInt(key.split('-').pop() || '0')
      if (timestamp < cutoff) {
        this.recoveryAttempts.delete(key)
      }
    }
  }

  /**
   * Run automatic error detection and recovery
   */
  public async runAutoRecovery(): Promise<{ detected: number; recovered: number; failed: number }> {
    const detectedErrors = await this.detectErrors()
    let recovered = 0
    let failed = 0

    for (const error of detectedErrors) {
      const result = await this.recoverFromError(error)
      if (result.success) {
        recovered++
        if (this.options.logErrors) {
          console.log(`Recovered from error ${error.code}: ${result.message}`)
        }
      } else {
        failed++
        if (this.options.logErrors) {
          console.error(`Failed to recover from error ${error.code}: ${result.message}`)
        }
      }
    }

    // Clean up old errors
    this.clearOldErrors()

    return {
      detected: detectedErrors.length,
      recovered,
      failed
    }
  }
}

// Singleton instance
let unifiedErrorRecoveryService: UnifiedErrorRecoveryService | null = null

export function getUnifiedErrorRecoveryService(options?: Partial<ErrorRecoveryOptions>): UnifiedErrorRecoveryService {
  if (!unifiedErrorRecoveryService) {
    unifiedErrorRecoveryService = new UnifiedErrorRecoveryService(options)
  }
  return unifiedErrorRecoveryService
}

export function resetUnifiedErrorRecoveryService(): void {
  unifiedErrorRecoveryService = null
}