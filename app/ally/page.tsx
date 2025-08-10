'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AllyInstance {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: number;
  currentModel: string;
  platform: string;
}

export default function AllyMonitor() {
  const [instances, setInstances] = useState<AllyInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch instances
  const fetchInstances = async () => {
    try {
      const response = await fetch('/api/ally');
      const data = await response.json();
      setInstances(data.instances || []);
    } catch (error) {
      console.error('Failed to fetch instances:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll for updates
  useEffect(() => {
    fetchInstances();
    const interval = setInterval(fetchInstances, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const formatLastSeen = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    return `${hours}h ago`;
  };

  const selectedInstanceData = instances.find(instance => instance.id === selectedInstance);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-retro-green via-retro-cyan to-retro-blue bg-clip-text text-transparent mb-4 font-mono">
            ALLY // REMOTE MONITOR
          </h1>
          <p className="text-xl text-purple-200/80">
            Monitor your Ally AI instances remotely
          </p>
        </div>

        {/* Instances Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <AnimatePresence>
            {instances.map((instance) => (
              <motion.div
                key={instance.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={cn(
                  "bg-gray-800/40 backdrop-blur-lg border rounded-3xl p-6 cursor-pointer transition-all",
                  "hover:scale-105 hover:shadow-2xl",
                  selectedInstance === instance.id 
                    ? "border-retro-green/50 shadow-retro-green/20" 
                    : "border-retro-green/20 hover:border-retro-green/40"
                )}
                onClick={() => setSelectedInstance(instance.id)}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-purple-100 font-mono">
                    {instance.name}
                  </h3>
                  <div className={cn(
                    "w-3 h-3 rounded-full",
                    instance.status === 'online' ? "bg-retro-green animate-pulse" : "bg-red-500"
                  )} />
                </div>

                <div className="space-y-2 text-sm text-purple-200/80">
                  <div className="flex items-center gap-2">
                    <span className="text-retro-cyan">Platform:</span>
                    <span className="font-mono">{instance.platform}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-retro-cyan">Model:</span>
                    <span className="font-mono">{instance.currentModel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-retro-cyan">Last seen:</span>
                    <span className="font-mono">{formatLastSeen(instance.lastSeen)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      instance.status === 'online' ? "bg-retro-green" : "bg-red-500"
                    )} />
                    <span className="text-xs font-mono uppercase tracking-wider">
                      {instance.status}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* No instances message */}
        {!isLoading && instances.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-2xl font-bold text-purple-100 mb-2">No Ally instances found</h3>
            <p className="text-purple-200/60">
              Start your Ally desktop app to see it appear here
            </p>
          </motion.div>
        )}

        {/* Loading state */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-2 h-2 bg-retro-green rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-retro-cyan rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-retro-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-purple-200/60">Scanning for Ally instances...</p>
          </motion.div>
        )}

        {/* Instance Details Modal */}
        <AnimatePresence>
          {selectedInstanceData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
              onClick={() => setSelectedInstance(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-gray-800/90 backdrop-blur-lg border border-retro-green/30 rounded-3xl p-8 max-w-2xl w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-purple-100 font-mono">
                    {selectedInstanceData.name}
                  </h2>
                  <button
                    onClick={() => setSelectedInstance(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <span className="text-2xl">×</span>
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="text-sm text-retro-cyan mb-1">Status</div>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          selectedInstanceData.status === 'online' ? "bg-retro-green" : "bg-red-500"
                        )} />
                        <span className="font-mono uppercase">{selectedInstanceData.status}</span>
                      </div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="text-sm text-retro-cyan mb-1">Platform</div>
                      <div className="font-mono">{selectedInstanceData.platform}</div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="text-sm text-retro-cyan mb-1">Model</div>
                      <div className="font-mono">{selectedInstanceData.currentModel}</div>
                    </div>
                    <div className="bg-black/20 rounded-lg p-4">
                      <div className="text-sm text-retro-cyan mb-1">Last Seen</div>
                      <div className="font-mono">{formatLastSeen(selectedInstanceData.lastSeen)}</div>
                    </div>
                  </div>

                  <div className="bg-black/20 rounded-lg p-4">
                    <div className="text-sm text-retro-cyan mb-2">Connection Info</div>
                    <div className="font-mono text-xs bg-black/30 p-2 rounded">
                      ID: {selectedInstanceData.id}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}