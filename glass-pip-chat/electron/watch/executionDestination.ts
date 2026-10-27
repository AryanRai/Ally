/** Agent execution location is independent of provider, chat and phone-control transport. */
export type ExecutionLocation = 'pc' | 'phone';
export interface ExecutionOption {
  location: ExecutionLocation;
  label: string;
  available: boolean;
  reason: string;
}
export interface ExecutionDestinationOffer {
  version: 1;
  suggested: ExecutionLocation | null;
  options: ExecutionOption[];
}

/** Describes routes only. It does not authenticate a provider or authorize a submission. */
export function executionDestinationOffer(pcRouteAvailable = true): ExecutionDestinationOffer {
  return {
    version: 1,
    suggested: pcRouteAvailable ? 'pc' : null,
    options: [
      { location: 'pc', label: 'Run on PC', available: pcRouteAvailable,
        reason: pcRouteAvailable ? 'Your existing Codex or Claude chat runs through Ally on your PC. Provider readiness is checked when sending.' : 'The PC connection is unavailable. Your words are kept.' },
      { location: 'phone', label: 'Run on phone', available: false,
        reason: 'No on-device agent backend is installed. Phone control from a PC is a separate capability.' },
    ],
  };
}

/** Never silently reinterpret a requested phone execution as a desktop run. */
export function requirePcExecution(location: unknown): void {
  if (location !== 'pc') throw new Error(location === 'phone'
    ? 'On-device agent execution is unavailable. Choose Run on PC explicitly.'
    : 'Choose an execution location explicitly.');
}
