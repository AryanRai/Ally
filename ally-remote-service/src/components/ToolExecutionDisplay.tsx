'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Settings, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ChevronDown, 
  ChevronRight,
  Terminal,
  Zap
} from 'lucide-react'
import type { ToolExecution } from '@/types'

interface ToolExecutionDisplayProps {
  executions: ToolExecution[]
  onCancel?: (executionId: string) => void
}

export function ToolExecutionDisplay({ executions, onCancel }: ToolExecutionDisplayProps) {
  const [expandedExecutions, setExpandedExecutions] = useState<Set<string>>(new Set())

  const toggleExpanded = (executionId: string) => {
    const newExpanded = new Set(expandedExecutions)
    if (newExpanded.has(executionId)) {
      newExpanded.delete(executionId)
    } else {
      newExpanded.add(executionId)
    }
    setExpandedExecutions(newExpanded)
  }

  const getStatusIcon = (status: ToolExecution['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />
      case 'running':
        return <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-400" />
      default:
        return <Settings className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: ToolExecution['status']) => {
    switch (status) {
      case 'pending':
        return 'border-yellow-500/20 bg-yellow-500/5'
      case 'running':
        return 'border-blue-500/20 bg-blue-500/5'
      case 'completed':
        return 'border-green-500/20 bg-green-500/5'
      case 'failed':
        return 'border-red-500/20 bg-red-500/5'
      default:
        return 'border-gray-500/20 bg-gray-500/5'
    }
  }

  const formatExecutionTime = (timeMs?: number) => {
    if (!timeMs) return null
    if (timeMs < 1000) return `${timeMs}ms`
    return `${(timeMs / 1000).toFixed(1)}s`
  }

  const formatParameters = (parameters: Record<string, any>) => {
    return Object.entries(parameters)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
  }

  if (executions.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2 text-sm text-gray-400">
        <Terminal className="w-4 h-4" />
        <span>Tool Executions</span>
      </div>

      <div className="space-y-2">
        {executions.map((execution) => (
          <motion.div
            key={execution.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass rounded-lg border ${getStatusColor(execution.status)} overflow-hidden`}
          >
            {/* Header */}
            <div 
              className="p-3 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => toggleExpanded(execution.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {expandedExecutions.has(execution.id) ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    {getStatusIcon(execution.status)}
                  </div>
                  
                  <div>
                    <div className="flex items-center space-x-2">
                      <Zap className="w-3 h-3 text-blue-400" />
                      <span className="text-white font-medium">{execution.tool_name}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {execution.status === 'running' && 'Executing...'}
                      {execution.status === 'completed' && execution.execution_time_ms && 
                        `Completed in ${formatExecutionTime(execution.execution_time_ms)}`}
                      {execution.status === 'failed' && 'Execution failed'}
                      {execution.status === 'pending' && 'Queued for execution'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {execution.status === 'running' && onCancel && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onCancel(execution.id)
                      }}
                      className="text-xs px-2 py-1 glass rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  
                  <span className="text-xs text-gray-500">
                    {new Date(execution.created_at).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Expanded content */}
            <AnimatePresence>
              {expandedExecutions.has(execution.id) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-white/10"
                >
                  <div className="p-3 space-y-3 text-sm">
                    {/* Parameters */}
                    {Object.keys(execution.parameters).length > 0 && (
                      <div>
                        <div className="text-gray-400 mb-1">Parameters:</div>
                        <div className="glass-subtle rounded p-2 font-mono text-xs text-gray-300">
                          {formatParameters(execution.parameters)}
                        </div>
                      </div>
                    )}

                    {/* Result */}
                    {execution.result && (
                      <div>
                        <div className="text-gray-400 mb-1">Result:</div>
                        <div className="glass-subtle rounded p-2 font-mono text-xs text-gray-300 max-h-32 overflow-y-auto">
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(execution.result, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Error message */}
                    {execution.error_message && (
                      <div>
                        <div className="text-red-400 mb-1">Error:</div>
                        <div className="glass-subtle rounded p-2 bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                          {execution.error_message}
                        </div>
                      </div>
                    )}

                    {/* Execution details */}
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>ID: {execution.id.slice(0, 8)}...</span>
                      {execution.completed_at && (
                        <span>
                          Completed: {new Date(execution.completed_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  )
}