/**
 * Remote Settings Component
 * 
 * Provides UI for managing LOCAL/REMOTE mode switching and authentication
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wifi, 
  WifiOff, 
  Monitor, 
  Globe, 
  User, 
  Lock, 
  LogIn, 
  Settings,
  Server,
  Key
} from 'lucide-react';
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { RemoteTestButton } from './RemoteTestButton';
import { AuthHelper } from './AuthHelper';

interface RemoteSettingsProps {
  className?: string;
}

export const RemoteSettings: React.FC<RemoteSettingsProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [systemId, setSystemId] = useState(localStorage.getItem('ally-system-id') || 'ally-local-system');
  const [systemName, setSystemName] = useState(localStorage.getItem('ally-system-name') || 'Ally Local System');

  const {
    mode,
    isConnected,
    isAuthenticated,
    user,
    serviceStatus,
    connectionError,
    isLoading,
    setMode,
    signIn,
    signUp,
    signOut,
    startRemoteService,
    stopRemoteService,
    refreshStatus
  } = useRemoteConnection();

  const getStatusColor = () => {
    if (mode === 'local') return 'text-blue-400';
    if (isConnected && isAuthenticated) return 'text-green-400';
    if (connectionError) return 'text-red-400';
    return 'text-yellow-400';
  };

  const getStatusIcon = () => {
    if (mode === 'local') return <Monitor className="w-4 h-4" />;
    if (isConnected) return <Wifi className="w-4 h-4" />;
    return <WifiOff className="w-4 h-4" />;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isSignUp) {
        await signUp(email, password);
        // Don't automatically switch to sign in - let user know to check email
        alert('Account created! Please check your email to confirm your account, then try signing in.');
      } else {
        await signIn(email, password);
        setShowAuthForm(false);
      }
    } catch (error) {
      console.error('Authentication failed:', error);
      // The error will be shown in the connectionError state
    }
  };

  const handleModeSwitch = (newMode: 'local' | 'remote') => {
    setMode(newMode);
    if (newMode === 'remote' && !isAuthenticated) {
      setShowAuthForm(true);
    }
  };

  const handleSystemConfigSave = () => {
    localStorage.setItem('ally-system-id', systemId);
    localStorage.setItem('ally-system-name', systemName);
    // Restart remote service to apply new config
    if (isConnected) {
      stopRemoteService().then(() => {
        setTimeout(() => startRemoteService(), 1000);
      });
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Status indicator button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          bg-gray-800/50 backdrop-blur-sm border border-gray-600/30
          hover:bg-gray-700/50 transition-all duration-200
          ${getStatusColor()}
        `}
        title={`Mode: ${mode.toUpperCase()}`}
      >
        {getStatusIcon()}
        <Settings className="w-4 h-4" />
        <span className="text-xs font-mono">{mode.toUpperCase()}</span>
      </button>

      {/* Settings panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="
              absolute top-full right-0 mt-2 w-80 p-4
              bg-gray-900/95 backdrop-blur-lg border border-gray-600/30
              rounded-xl shadow-2xl z-50
            "
          >
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-2 pb-2 border-b border-gray-600/30">
                <Server className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-gray-100">Remote Control</h3>
              </div>

              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Mode:</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleModeSwitch('local')}
                    className={`
                      flex-1 px-3 py-2 text-xs font-medium rounded-lg
                      transition-colors duration-200
                      ${mode === 'local' 
                        ? 'bg-blue-600/30 border border-blue-600/50 text-blue-400' 
                        : 'bg-gray-600/20 border border-gray-600/30 text-gray-400 hover:bg-gray-600/30'
                      }
                    `}
                  >
                    <Monitor className="w-3 h-3 inline mr-1" />
                    LOCAL
                  </button>
                  <button
                    onClick={() => handleModeSwitch('remote')}
                    className={`
                      flex-1 px-3 py-2 text-xs font-medium rounded-lg
                      transition-colors duration-200
                      ${mode === 'remote' 
                        ? 'bg-green-600/30 border border-green-600/50 text-green-400' 
                        : 'bg-gray-600/20 border border-gray-600/30 text-gray-400 hover:bg-gray-600/30'
                      }
                    `}
                  >
                    <Globe className="w-3 h-3 inline mr-1" />
                    REMOTE
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Status:</span>
                <div className={`flex items-center gap-2 ${getStatusColor()}`}>
                  {getStatusIcon()}
                  <span className="text-xs font-mono">
                    {mode === 'local' ? 'Local Mode' : 
                     isConnected ? 'Connected' : 
                     isAuthenticated ? 'Authenticated' : 'Disconnected'}
                  </span>
                </div>
              </div>

              {/* Error display */}
              {connectionError && (
                <div className="p-2 bg-red-900/30 border border-red-600/30 rounded-lg">
                  <p className="text-xs text-red-400">{connectionError}</p>
                </div>
              )}

              {/* System Configuration */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-600/30">
                  <Key className="w-4 h-4 text-yellow-400" />
                  <h4 className="text-sm font-semibold text-gray-100">System Configuration</h4>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-400">System ID:</label>
                    <input
                      type="text"
                      value={systemId}
                      onChange={(e) => setSystemId(e.target.value)}
                      className="
                        w-full px-2 py-1 text-xs
                        bg-gray-800/50 border border-gray-600/30 rounded
                        text-gray-100 placeholder-gray-500
                        focus:outline-none focus:border-blue-400/50
                      "
                      placeholder="ally-local-system"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs text-gray-400">System Name:</label>
                    <input
                      type="text"
                      value={systemName}
                      onChange={(e) => setSystemName(e.target.value)}
                      className="
                        w-full px-2 py-1 text-xs
                        bg-gray-800/50 border border-gray-600/30 rounded
                        text-gray-100 placeholder-gray-500
                        focus:outline-none focus:border-blue-400/50
                      "
                      placeholder="Ally Local System"
                    />
                  </div>
                  
                  <button
                    onClick={handleSystemConfigSave}
                    className="
                      w-full px-2 py-1 text-xs font-medium
                      bg-yellow-600/20 border border-yellow-600/30 rounded
                      text-yellow-400 hover:bg-yellow-600/30
                      transition-colors duration-200
                    "
                  >
                    Save Configuration
                  </button>
                </div>
              </div>

              {/* Remote mode content */}
              {mode === 'remote' && (
                <>
                  {/* Authentication */}
                  {!isAuthenticated ? (
                    <div className="space-y-3">
                      {!showAuthForm ? (
                        <div className="space-y-2">
                          <button
                            onClick={() => setShowAuthForm(true)}
                            className="
                              w-full px-3 py-2 text-xs font-medium
                              bg-blue-600/20 border border-blue-600/30 rounded-lg
                              text-blue-400 hover:bg-blue-600/30
                              transition-colors duration-200
                            "
                          >
                            <LogIn className="w-3 h-3 inline mr-1" />
                            Sign In to Enable Remote
                          </button>
                          
                          {/* Quick Auth Helper */}
                          <details className="text-xs">
                            <summary className="text-gray-400 cursor-pointer hover:text-gray-300">
                              Need an account? Click here
                            </summary>
                            <div className="mt-2">
                              <AuthHelper />
                            </div>
                          </details>
                        </div>
                      ) : (
                        <form onSubmit={handleAuth} className="space-y-3">
                          <div className="space-y-2">
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="Email"
                              required
                              className="
                                w-full px-3 py-2 text-xs
                                bg-gray-800/50 border border-gray-600/30 rounded-lg
                                text-gray-100 placeholder-gray-500
                                focus:outline-none focus:border-blue-400/50
                              "
                            />
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Password"
                              required
                              className="
                                w-full px-3 py-2 text-xs
                                bg-gray-800/50 border border-gray-600/30 rounded-lg
                                text-gray-100 placeholder-gray-500
                                focus:outline-none focus:border-blue-400/50
                              "
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={isLoading}
                              className="
                                flex-1 px-3 py-2 text-xs font-medium
                                bg-blue-600/20 border border-blue-600/30 rounded-lg
                                text-blue-400 hover:bg-blue-600/30
                                disabled:opacity-50 disabled:cursor-not-allowed
                                transition-colors duration-200
                              "
                            >
                              {isLoading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsSignUp(!isSignUp)}
                              className="
                                px-3 py-2 text-xs font-medium
                                bg-gray-600/20 border border-gray-600/30 rounded-lg
                                text-gray-400 hover:bg-gray-600/30
                                transition-colors duration-200
                              "
                            >
                              {isSignUp ? 'Sign In' : 'Sign Up'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* User info */}
                      <div className="flex items-center gap-2 p-2 bg-green-900/20 border border-green-600/30 rounded-lg">
                        <User className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-green-400">{user?.email}</span>
                      </div>

                      {/* Service controls */}
                      <div className="flex gap-2">
                        {isConnected ? (
                          <button
                            onClick={stopRemoteService}
                            disabled={isLoading}
                            className="
                              flex-1 px-3 py-2 text-xs font-medium
                              bg-red-600/20 border border-red-600/30 rounded-lg
                              text-red-400 hover:bg-red-600/30
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-colors duration-200
                            "
                          >
                            {isLoading ? 'Stopping...' : 'Stop Service'}
                          </button>
                        ) : (
                          <button
                            onClick={startRemoteService}
                            disabled={isLoading}
                            className="
                              flex-1 px-3 py-2 text-xs font-medium
                              bg-green-600/20 border border-green-600/30 rounded-lg
                              text-green-400 hover:bg-green-600/30
                              disabled:opacity-50 disabled:cursor-not-allowed
                              transition-colors duration-200
                            "
                          >
                            {isLoading ? 'Starting...' : 'Start Service'}
                          </button>
                        )}
                        <button
                          onClick={refreshStatus}
                          className="
                            px-3 py-2 text-xs font-medium
                            bg-gray-600/20 border border-gray-600/30 rounded-lg
                            text-gray-400 hover:bg-gray-600/30
                            transition-colors duration-200
                          "
                        >
                          Refresh
                        </button>
                      </div>

                      {/* Service status details */}
                      {serviceStatus && (
                        <div className="p-2 bg-gray-800/50 rounded-lg space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">System ID:</span>
                            <span className="text-gray-300 font-mono">{serviceStatus.pollerStatus.systemId}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Polling:</span>
                            <span className={serviceStatus.pollerStatus.isPolling ? 'text-green-400' : 'text-red-400'}>
                              {serviceStatus.pollerStatus.isPolling ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Ollama:</span>
                            <span className={serviceStatus.processorStatus.ollamaConnected ? 'text-green-400' : 'text-red-400'}>
                              {serviceStatus.processorStatus.ollamaConnected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Test Button */}
                      <RemoteTestButton />

                      <button
                        onClick={signOut}
                        className="
                          w-full px-3 py-2 text-xs font-medium
                          bg-gray-600/20 border border-gray-600/30 rounded-lg
                          text-gray-400 hover:bg-gray-600/30
                          transition-colors duration-200
                        "
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Instructions */}
              <div className="pt-2 border-t border-gray-600/30">
                <p className="text-xs text-gray-500 leading-relaxed">
                  {mode === 'local' 
                    ? 'Local mode: Chat directly with your local Ally system.'
                    : 'Remote mode: Enable web access to your local Ally system via Supabase.'
                  }
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};