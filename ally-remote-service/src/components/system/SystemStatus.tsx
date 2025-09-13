'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { getStatusColor } from '@/lib/utils';
import { Wifi, WifiOff, Server, AlertCircle } from 'lucide-react';

interface LocalSystem {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  computed_status: 'online' | 'offline' | 'busy';
  last_seen: number;
  capabilities: {
    models: string[];
    tools: string[];
    features: string[];
  };
}

export function SystemStatus() {
  const [systems, setSystems] = useState<LocalSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSystems = async () => {
    try {
      const response = await fetch('/api/systems');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch systems');
      }

      setSystems(data.systems);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch systems');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystems();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchSystems, 30000);
    return () => clearInterval(interval);
  }, []);

  const onlineSystems = systems.filter(s => s.computed_status === 'online');
  const offlineSystems = systems.filter(s => s.computed_status === 'offline');

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <LoadingSpinner size="sm" />
        <span className="text-sm text-muted-foreground">Checking systems...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2">
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-sm text-red-500">System check failed</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {/* Connection Status */}
      <div className="flex items-center space-x-2">
        {onlineSystems.length > 0 ? (
          <>
            <Wifi className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-600 dark:text-green-400">
              {onlineSystems.length} system{onlineSystems.length !== 1 ? 's' : ''} online
            </span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-600 dark:text-red-400">
              No systems online
            </span>
          </>
        )}
      </div>

      {/* System Count */}
      <div className="flex items-center space-x-1 text-sm text-muted-foreground">
        <Server className="w-4 h-4" />
        <span>{systems.length} total</span>
      </div>

      {/* Refresh Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={fetchSystems}
        disabled={loading}
        className="text-xs"
      >
        Refresh
      </Button>
    </div>
  );
}