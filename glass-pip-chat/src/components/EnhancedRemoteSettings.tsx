/**
 * Enhanced Remote Settings Component
 * 
 * Provides comprehensive UI for managing remote chat integration and synchronization
 * Includes connection management, authentication, and real-time sync controls
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wifi, 
  WifiOff, 
  Monitor, 
  Globe, 
  User, 
  LogIn, 
  Settings,
  Server,
  Key,
  Sync,
  Activity,
  Eye,
  EyeOff
} from 'lucide-react';
import { useRemoteConnection } from '../hooks/useRemoteConnection';
import { useRemoteChatSync } from '../hooks/useRemoteChatSync';
import { RemoteTestButton } from './RemoteTestButton';
import { AuthHelper } from './AuthHelper';
import { RemoteProcessingIndicator } from './RemoteProcessingIndicator';
import { Message } from '../types/chat';

interface EnhancedRemoteSettingsProps {
  className?: string;
  onRemoteMessage?: (message: Message) => void;
  onRemoteResponse?: (message: Message) => void;
}

export const EnhancedRemoteSettings: React.FC<EnhancedRemoteSettingsProps> = ({ 
  className = '',
  onRemoteMessage,
  onRemoteResponse
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'connection' | 'sync' | 'status'>('connection');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [systemId, setSystemId] = useState(localStorage.getItem('ally-system-id') || 'ally-local-system');
  const [systemName, setSystemName] = useState(localStorage.getItem('ally-system-name') || 'Ally Local System');
  const [showProcessingDetails, setShowProcessingDetails] = useState(false);

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

  const [syncState, syncActions] = useRemoteChatSync(
    {
      systemId,
      systemName,
      enabled: mode === 'remote' && isAuthenticated,
      autoStart: true
    },
    onRemoteMessage,
    onRemoteResponse
  );

  const getStatusColor = () => {
    if (mode === 'local') return 'text-blue-400';
    if (isConnected && syncState.isActive) return 'text-green-400';
    if (connectionError || syncState.error) return 'text-red-400';
    if (isConnected || syncState.isActive) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const getStatusIcon = () => {
    if (mode === 'local') return <Monitor className="w-4 h-4" />;
    if (isConnected && syncState.isActive) return <Sync className="w-4 h-4 animate-spin" />;
    if (isConnected) return <Wifi className="w-4 h-4" />;
    return <WifiOff className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (mode === 'local') return 'LOCAL';
    if (isConnected && syncState.isActive) return 'SYNC';
    if (isConnected) return 'CONN';
    return 'OFF';
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isSignUp) {
        await signUp(email, password);
        alert('Account created! Please check your email to confirm your account, then try signing in.');
      } else {
        await signIn(email, password);
        setShowAuthForm(false);
      }
    } catch (error) {
      console.error('Authentication failed:', error);
    }
  };

  const handleModeSwitch = async (newMode: 'local' | 'remote') => {
    if (newMode === 'local') {
      // Stop sync when switching to local
      if (syncState.isActive) {
        await syncActions.stop();
      }
    }
    
    setMode(newMode);
    
    if (newMode === 'remote' && !isAuthenticated) {
      setShowAuthForm(true);
    }
  };

  const handleSystemConfigSave = () => {
    localStorage.setItem('ally-system-id', systemId);
    localStorage.setItem('ally-system-name', systemName);
    
    // Restart services to apply new config
    if (isConnected) {
      stopRemoteService().then(() => {
        setTimeout(() => startRemoteService(), 1000);
      });
    }
    
    if (syncState.isActive) {
      syncActions.stop().then(() => {
        setTimeout(() => syncActions.start(), 1000);
      });
    }
  };

  const handleToggleSync = async () => {
    try {
      if (syncState.isActive) {
        await syncActions.stop();
      } else {
        await syncActions.start();
      }
    } catch (error) {
      console.error('Failed to toggle sync:', error);
    }
  };

  const tabs = [
    { id: 'connection', label: 'Connection', icon: <Server className="w-3 h-3" /> },
    { id: 'sync', label: 'Chat Sync', icon: <Sync className="w-3 h-3" /> },
    { id: 'status', label: 'Status', icon: <Activity className="w-3 h-3" /> }
  ];

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
        title={`Mode: ${mode.toUpperCase()} | Status: ${getStatusText()}`}
      >
        {getStatusIcon()}
        <Settings className="w-4 h-4" />
        <span className="text-xs font-mono">{getStatusText()}</span>
        {syncState.processingUpdates.length > 0 && (
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Settings panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="
              absolute top-full right-0 mt-2 w-96 max-h-[80vh] overflow-hidden
              bg-gray-900/95 backdrop-blur-lg border border-gray-600/30
              rounded-xl shadow-2xl z-50
            "
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-600/30">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-gray-100">Remote Control</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-600/30">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium
                    transition-colors duration-200
                    ${activeTab === tab.id
                      ? 'text-blue-400 bg-blue-600/20 border-b-2 border-blue-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-600/20'
                    }
                  `}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {/* Connection Tab */}
              {activeTab === 'connection' && (
                <div className="space-y-4">
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

                  {/* Authentication for Remote Mode */}
                  {mode === 'remote' && !isAuthenticated && (
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
                  )}

                  {/* User info and service controls */}
                  {mode === 'remote' && isAuthenticated && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-2 bg-green-900/20 border border-green-600/30 rounded-lg">
                        <User className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-green-400">{user?.email}</span>
                      </div>

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
                </div>
              )}

              {/* Sync Tab */}
              {activeTab === 'sync' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                    <h4 className="text-xs font-medium text-blue-400 mb-1">Chat Synchronization</h4>
                    <p className="text-xs text-blue-300/80">
                      Real-time bidirectional chat sync between local and remote interfaces.
                    </p>
                  </div>

                  {mode === 'remote' && isAuthenticated ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Sync Status:</span>
                        <div className={`flex items-center gap-2 ${syncState.isActive ? 'text-green-400' : 'text-gray-400'}`}>
                          <Sync className={`w-3 h-3 ${syncState.isActive ? 'animate-spin' : ''}`} />
                          <span className="text-xs font-mono">
                            {syncState.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleToggleSync}
                        disabled={!isConnected}
                        className={`
                          w-full px-3 py-2 text-xs font-medium rounded-lg
                          transition-colors duration-200
                          ${syncState.isActive
                            ? 'bg-red-600/20 border border-red-600/30 text-red-400 hover:bg-red-600/30'
                            : 'bg-green-600/20 border border-green-600/30 text-green-400 hover:bg-green-600/30'
                          }
                          ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        {syncState.isActive ? 'Stop Sync' : 'Start Sync'}
                      </button>

                      {syncState.isActive && (
                        <div className="p-2 bg-gray-800/50 rounded-lg space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Synced Sessions:</span>
                            <span className="text-gray-300">{syncState.syncedSessions}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-400">Processing Messages:</span>
                            <span className="text-gray-300">{syncState.processingUpdates.length}</span>
                          </div>
                          {syncState.lastSyncTime && (
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-400">Last Sync:</span>
                              <span className="text-gray-300">
                                {new Date(syncState.lastSyncTime).toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {syncState.error && (
                        <div className="p-2 bg-red-900/20 border border-red-600/30 rounded-lg">
                          <p className="text-xs text-red-400">{syncState.error}</p>
                          <button
                            onClick={syncActions.clearError}
                            className="mt-1 text-xs text-red-300 hover:text-red-200 underline"
                          >
                            Clear Error
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                      <p className="text-xs text-gray-400">
                        {mode === 'local' 
                          ? 'Switch to Remote mode to enable chat sync'
                          : 'Sign in to enable chat synchronization'
                        }
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Status Tab */}
              {activeTab === 'status' && (
                <div className="space-y-4">
                  {/* Overall Status */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-800/50 rounded border">
                      <div className="text-xs text-gray-400">Connection</div>
                      <div className={`text-xs font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-800/50 rounded border">
                      <div className="text-xs text-gray-400">Chat Sync</div>
                      <div className={`text-xs font-medium ${syncState.isActive ? 'text-green-400' : 'text-gray-400'}`}>
                        {syncState.isActive ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                  </div>

                  {/* Error Display */}
                  {(connectionError || syncState.error) && (
                    <div className="p-2 bg-red-900/20 border border-red-600/30 rounded-lg">
                      <p className="text-xs text-red-400">
                        {connectionError || syncState.error}
                      </p>
                    </div>
                  )}

                  {/* Service Status Details */}
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

                  {/* Processing Status */}
                  {syncState.isActive && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium text-gray-300">Real-time Processing</h4>
                        <button
                          onClick={() => setShowProcessingDetails(!showProcessingDetails)}
                          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                        >
                          {showProcessingDetails ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                      
                      <RemoteProcessingIndicator
                        processingUpdates={syncState.processingUpdates}
                        syncStatus={syncState.status}
                        compact={!showProcessingDetails}
                      />
                      
                      {syncState.processingUpdates.length === 0 && (
                        <div className="text-xs text-gray-500 text-center py-2">
                          No messages currently being processed
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-600/30">
              <p className="text-xs text-gray-500 leading-relaxed">
                {mode === 'local' 
                  ? 'Local mode: Chat directly with your local Ally system.'
                  : syncState.isActive
                    ? 'Remote sync active: Messages sync bidirectionally in real-time.'
                    : 'Remote mode: Enable web access and chat synchronization.'
                }
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};