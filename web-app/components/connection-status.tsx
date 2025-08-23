'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

interface ConnectionStatusProps {
  connected: boolean;
  serverUrl: string;
  onTest?: () => Promise<boolean>;
}

export default function ConnectionStatus({ connected, serverUrl, onTest }: ConnectionStatusProps) {
  const [testing, setTesting] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<boolean | null>(null);

  const handleTest = async () => {
    if (!onTest) return;
    
    setTesting(true);
    try {
      const result = await onTest();
      setLastTestResult(result);
    } catch (error) {
      setLastTestResult(false);
    } finally {
      setTesting(false);
    }
  };

  const getStatusColor = () => {
    if (connected) return 'bg-green-500';
    if (testing) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (testing) return 'Testing...';
    if (connected) return 'Connected';
    return 'Disconnected';
  };

  const getStatusIcon = () => {
    if (testing) return <Loader2 className="w-4 h-4 animate-spin" />;
    if (connected) return <Wifi className="w-4 h-4" />;
    return <WifiOff className="w-4 h-4" />;
  };

  return (
    <div className="flex items-center gap-3">
      {/* Status Badge */}
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="flex items-center gap-2"
      >
        <Badge 
          variant="secondary" 
          className={`${getStatusColor()} text-white border-0 px-3 py-1`}
        >
          {getStatusIcon()}
          <span className="ml-2 font-medium">{getStatusText()}</span>
        </Badge>
      </motion.div>

      {/* Server URL Display */}
      <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-lg">
        <span className="text-xs text-muted-foreground">Server:</span>
        <code className="text-xs font-mono">{serverUrl}</code>
      </div>

      {/* Test Connection Button */}
      {onTest && !connected && (
        <Button
          onClick={handleTest}
          disabled={testing}
          size="sm"
          variant="outline"
          className="flex items-center gap-2"
        >
          {testing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <CheckCircle className="w-3 h-3" />
          )}
          Test
        </Button>
      )}

      {/* Last Test Result */}
      {lastTestResult !== null && !connected && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
            lastTestResult 
              ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
              : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}
        >
          {lastTestResult ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          <span>{lastTestResult ? 'Reachable' : 'Unreachable'}</span>
        </motion.div>
      )}
    </div>
  );
}