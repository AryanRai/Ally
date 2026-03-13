/**
 * AgentActivityStream — Cursor-style live feed of every agent step.
 *
 * When active it renders a vertical timeline above the streaming response.
 * When the task completes it collapses to a summary pill with an option to
 * expand the full step history.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentStep {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'context_compressed' | 'llm_response' | 'error';
  label: string;      // e.g. "Reading file..." / "Searching web..."
  detail?: string;    // expandable raw content (optional)
  status: 'running' | 'success' | 'error' | 'skipped';
  durationMs?: number;
  isParallel?: boolean;
  errorClass?: string;
  timestamp: number;
}

export interface AgentActivityStreamProps {
  steps: AgentStep[];
  isActive: boolean;
  stepCount: number;
  maxSteps?: number;
  onToggleExpand?: () => void;
  theme?: 'light' | 'dark';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stepIcon(type: AgentStep['type'], status: AgentStep['status']): string {
  if (status === 'error') return '❌';
  switch (type) {
    case 'thinking': return '🧠';
    case 'tool_call': return '🔧';
    case 'tool_result': return status === 'success' ? '✅' : '🔧';
    case 'context_compressed': return '📦';
    case 'llm_response': return '💬';
    case 'error': return '❌';
    default: return '•';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Single step row ─────────────────────────────────────────────────────────

interface StepRowProps {
  step: AgentStep;
  isIndented?: boolean;
}

function StepRow({ step, isIndented = false }: StepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = step.status === 'running';
  const isError = step.status === 'error';

  return (
    <div className={cn('flex flex-col', isIndented && 'ml-4 border-l border-white/10 pl-3')}>
      <div className="flex items-center gap-2 py-0.5">
        {/* Status icon */}
        <span className="flex-shrink-0 text-[11px]">{stepIcon(step.type, step.status)}</span>

        {/* Spinner for running */}
        {isRunning && (
          <span className="flex-shrink-0 w-3 h-3 rounded-full border-t-2 border-blue-400 animate-spin" />
        )}

        {/* Label */}
        <span
          className={cn(
            'flex-1 text-[11px] truncate',
            isRunning ? 'text-blue-300' : isError ? 'text-red-300' : 'text-white/60',
          )}
        >
          {step.label}
        </span>

        {/* Duration */}
        {step.durationMs !== undefined && (
          <span className="text-[10px] text-white/30 flex-shrink-0">{formatDuration(step.durationMs)}</span>
        )}

        {/* Expand chevron (only if there's detail) */}
        {step.detail && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-white/30 hover:text-white/60 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Expandable detail */}
      <AnimatePresence>
        {expanded && step.detail && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-5 mt-0.5 mb-1 rounded-md border border-white/10 bg-black/30 overflow-hidden"
          >
            <pre className="p-2 text-[10px] text-white/50 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {step.detail}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgentActivityStream({
  steps,
  isActive,
  stepCount,
  maxSteps = 8,
  theme = 'dark',
}: AgentActivityStreamProps) {
  const [historyExpanded, setHistoryExpanded] = useState(false);

  if (steps.length === 0) return null;

  // Summary stats
  const toolCallCount = steps.filter((s) => s.type === 'tool_call').length;
  const totalDuration = steps.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
  const hasErrors = steps.some((s) => s.status === 'error');

  // Group parallel steps
  const rows: Array<{ step: AgentStep; isParallel: boolean; parallelSiblings: AgentStep[] }> = [];
  let parallelGroup: AgentStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.isParallel) {
      parallelGroup.push(step);
    } else {
      if (parallelGroup.length > 0) {
        parallelGroup.forEach((ps) =>
          rows.push({ step: ps, isParallel: true, parallelSiblings: parallelGroup }),
        );
        parallelGroup = [];
      }
      rows.push({ step, isParallel: false, parallelSiblings: [] });
    }
  }
  if (parallelGroup.length > 0) {
    parallelGroup.forEach((ps) =>
      rows.push({ step: ps, isParallel: true, parallelSiblings: parallelGroup }),
    );
  }

  // ── Active (running) state ──────────────────────────────────────────────────
  if (isActive) {
    return (
      <div
        className={cn(
          'mb-3 rounded-xl border',
          theme === 'dark'
            ? 'bg-white/[0.03] border-white/10'
            : 'bg-black/[0.03] border-black/10',
        )}
      >
        {/* Progress bar */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/40">
              Step {Math.min(stepCount, maxSteps)} of {maxSteps}
            </span>
          </div>
          <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"
              animate={{ width: `${Math.min((stepCount / maxSteps) * 100, 100)}%` }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            />
          </div>
        </div>

        {/* Step list */}
        <div className="px-3 pb-2 max-h-48 overflow-y-auto">
          {/* Parallel batch header when needed */}
          {(() => {
            const rendered: React.ReactNode[] = [];
            let lastParallelGroupKey: string | null = null;

            rows.forEach(({ step, isParallel, parallelSiblings }, i) => {
              if (isParallel) {
                const groupKey = parallelSiblings.map((s) => s.id).join('|');
                if (groupKey !== lastParallelGroupKey) {
                  lastParallelGroupKey = groupKey;
                  rendered.push(
                    <div key={`parallel-header-${groupKey}`} className="text-[10px] text-white/30 mt-1 mb-0.5 font-mono">
                      ⚡ Parallel batch ({parallelSiblings.length} tools)
                    </div>,
                  );
                }
                rendered.push(<StepRow key={`${step.id}-${i}`} step={step} isIndented />);
              } else {
                lastParallelGroupKey = null;
                rendered.push(<StepRow key={`${step.id}-${i}`} step={step} />);
              }
            });

            return rendered;
          })()}
        </div>
      </div>
    );
  }

  // ── Completed (collapsed pill) state ────────────────────────────────────────
  const summaryIcon = hasErrors ? '⚠️' : '✅';
  const summaryColor = hasErrors ? 'text-amber-300' : 'text-green-300';

  return (
    <div className="mb-3">
      {/* Summary pill */}
      <button
        onClick={() => setHistoryExpanded((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] border transition-all',
          'bg-white/[0.04] hover:bg-white/[0.08] border-white/10',
          summaryColor,
        )}
      >
        <span>{summaryIcon}</span>
        <span>
          Completed in {stepCount} step{stepCount !== 1 ? 's' : ''}
          {toolCallCount > 0 && ` · ${toolCallCount} tool${toolCallCount !== 1 ? 's' : ''}`}
          {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
        </span>
        {historyExpanded ? (
          <ChevronUp className="w-3 h-3 opacity-50" />
        ) : (
          <ChevronRight className="w-3 h-3 opacity-50" />
        )}
      </button>

      {/* Collapsible history */}
      <AnimatePresence>
        {historyExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'mt-2 rounded-xl border overflow-hidden',
              theme === 'dark'
                ? 'bg-white/[0.03] border-white/10'
                : 'bg-black/[0.03] border-black/10',
            )}
          >
            <div className="px-3 py-2 max-h-64 overflow-y-auto">
              {rows.map(({ step, isParallel }, i) => (
                <StepRow key={`${step.id}-${i}`} step={step} isIndented={isParallel} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
