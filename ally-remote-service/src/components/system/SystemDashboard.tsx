'use client';

import { useState, useEffect } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { formatTimestamp, formatDuration, getStatusBadgeColor } from '@/lib/utils';
import { 
  Server, 
  Cpu, 
  HardDrive, 
  Wifi, 
  Clock, 
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { motion } from 'framer-motion';

interface LocalSystem {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'busy';
  computed_status: 'online' | 'offline' | 'busy';
  last_seen: number;
  last_heartbeat: string;
  capabilities: {
    models: string[];
    tools: string[];
    features: string[];
  };
  metadata: Record<string, any>;
}

export function SystemDashboard() {
  const [systems, setSystems] = useState<LocalSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSystems = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    
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
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSystems();
    
    // Refresh every 10 seconds
    const interval = setInterval(() => fetchSystems(), 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'busy':
        return <Activity className="w-5 h-5 text-yellow-500 animate-pulse" />;
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-muted-foreground">Loading system dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-500 mb-4">Error: {error}</p>
          <Button onClick={() => fetchSystems()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">System Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor your connected Ally systems
            </p>
          </div>
          
          <Button
            onClick={() => fetchSystems(true)}
            disabled={refreshing}
            variant="outline"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-lg p-4 border"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Systems</p>
                <p className="text-2xl font-bold">{systems.length}</p>
              </div>
              <Server className="w-8 h-8 text-blue-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-lg p-4 border"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Online</p>
                <p className="text-2xl font-bold text-green-600">
                  {systems.filter(s => s.computed_status === 'online').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-lg p-4 border"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Offline</p>
                <p className="text-2xl font-bold text-red-600">
                  {systems.filter(s => s.computed_status === 'offline').length}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </motion.div>
        </div>

        {/* Systems List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Connected Systems</h2>
          
          {systems.length === 0 ? (
            <div className="text-center py-12">
              <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">No systems connected</p>
              <p className="text-sm text-muted-foreground">
                Make sure your local Ally system is running and connected to the internet.
              </p>
            </div>
          ) : (
            systems.map((system, index) => (
              <motion.div
                key={system.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-lg p-6 border"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(system.computed_status)}
                    <div>
                      <h3 className="font-semibold">{system.name}</h3>
                      <p className="text-sm text-muted-foreground">{system.id}</p>
                    </div>
                  </div>
                  
                  <div className={`px-3 py-1 rounded-full text-sm ${getStatusBadgeColor(system.computed_status)}`}>
                    {system.computed_status}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Last Seen</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatTimestamp(system.last_heartbeat)}
                      {system.last_seen < 60000 && (
                        <span className="text-green-500 ml-2">• Active</span>
                      )}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <Wifi className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Connection</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {system.last_seen < 60000 ? 'Stable' : 'Unstable'}
                    </p>
                  </div>
                </div>

                {/* Capabilities */}
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center">
                      <Cpu className="w-4 h-4 mr-2" />
                      Models ({system.capabilities.models?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {system.capabilities.models?.map((model) => (
                        <span
                          key={model}
                          className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs"
                        >
                          {model}
                        </span>
                      )) || <span className="text-xs text-muted-foreground">None</span>}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center">
                      <HardDrive className="w-4 h-4 mr-2" />
                      Tools ({system.capabilities.tools?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {system.capabilities.tools?.map((tool) => (
                        <span
                          key={tool}
                          className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs"
                        >
                          {tool}
                        </span>
                      )) || <span className="text-xs text-muted-foreground">None</span>}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center">
                      <Activity className="w-4 h-4 mr-2" />
                      Features ({system.capabilities.features?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {system.capabilities.features?.map((feature) => (
                        <span
                          key={feature}
                          className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-xs"
                        >
                          {feature}
                        </span>
                      )) || <span className="text-xs text-muted-foreground">None</span>}
                    </div>
                  </div>
                </div>

                {/* System Metadata */}
                {system.metadata && Object.keys(system.metadata).length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">System Info</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(system.metadata).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-muted-foreground">{key}:</span>
                          <span className="ml-2">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}