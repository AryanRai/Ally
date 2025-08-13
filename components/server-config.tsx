'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Settings, Server, Save, RotateCcw, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ServerConfigProps {
  currentUrl: string;
  connected: boolean;
  onUrlChange: (url: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function ServerConfig({ 
  currentUrl, 
  connected, 
  onUrlChange, 
  onConnect, 
  onDisconnect 
}: ServerConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(currentUrl);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setHasChanges(serverUrl !== currentUrl);
  }, [serverUrl, currentUrl]);

  const handleSave = () => {
    onUrlChange(serverUrl);
    setHasChanges(false);
  };

  const handleReset = () => {
    setServerUrl(currentUrl);
    setHasChanges(false);
  };

  const handleConnect = () => {
    if (hasChanges) {
      handleSave();
    }
    onConnect();
  };

  const getStatusColor = () => {
    if (connected) return 'text-green-500';
    return 'text-red-500';
  };

  const getStatusIcon = () => {
    if (connected) return <CheckCircle className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  return (
    <div className="relative">
      {/* Settings Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
      >
        <Settings className="w-4 h-4" />
        Server Config
      </Button>

      {/* Settings Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full right-0 mt-2 w-96 z-50"
          >
            <Card className="shadow-lg border-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Server className="w-5 h-5" />
                  Server Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current Status */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">Connection Status:</span>
                  <div className={`flex items-center gap-2 ${getStatusColor()}`}>
                    {getStatusIcon()}
                    <span className="text-sm font-medium">
                      {connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>

                {/* Server URL Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Server URL:</label>
                  <Input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="http://your-droplet-ip:3001"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your Digital Ocean droplet IP address with port 3001
                  </p>
                </div>

                {/* Changes Indicator */}
                {hasChanges && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
                  >
                    <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Unsaved changes</span>
                    </div>
                    <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
                      Save your changes to update the server connection
                    </p>
                  </motion.div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  {hasChanges && (
                    <>
                      <Button
                        onClick={handleSave}
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        Save
                      </Button>
                      <Button
                        onClick={handleReset}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </Button>
                    </>
                  )}
                  
                  {connected ? (
                    <Button
                      onClick={onDisconnect}
                      variant="destructive"
                      size="sm"
                      className="flex items-center gap-2 ml-auto"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      onClick={handleConnect}
                      size="sm"
                      className="flex items-center gap-2 ml-auto"
                    >
                      Connect
                    </Button>
                  )}
                </div>

                {/* Quick Setup Examples */}
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Quick Setup Examples:</p>
                  <div className="space-y-1">
                    {[
                      'http://164.90.123.456:3001',
                      'http://192.168.1.100:3001',
                      'http://localhost:3001'
                    ].map((example, index) => (
                      <button
                        key={index}
                        onClick={() => setServerUrl(example)}
                        className="block w-full text-left px-2 py-1 text-xs font-mono bg-muted/30 hover:bg-muted/50 rounded transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}