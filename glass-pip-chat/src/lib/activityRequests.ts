/** Use observed command start times, never the response completion timestamp. */
export function requestAnchor<T extends { id: string; startedAt?: number; endedAt?: number }>(createdAt: number | undefined, steps: T[]): string | undefined {
  const preceding = steps.filter(step => step.startedAt && step.startedAt <= (createdAt ?? 0)).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  return (preceding.find(step => !step.endedAt || step.endedAt >= (createdAt ?? 0)) ?? preceding[0])?.id;
}
export function requestMessageIndex(messages: { role: string; timestamp: number; steps?: { id: string; startedAt?: number; endedAt?: number }[]; metadata?: { segments?: { toolExecution?: { id: string; startTime: number; endTime?: number } }[] } }[], createdAt: number = 0): number {
  const candidates = messages.flatMap((message, index) => message.role === 'assistant'
    && (messages.slice(0,index).reverse().find(row=>row.role==='user')?.timestamp ?? message.timestamp) <= createdAt
    && (messages.slice(index+1).find(row=>row.role==='user')?.timestamp ?? Infinity) > createdAt ? [{message,index}] : []);
  const steps = candidates.flatMap(({message,index}) => (message.steps ?? message.metadata?.segments?.flatMap(part=>part.toolExecution?[{id:part.toolExecution.id,startedAt:part.toolExecution.startTime,endedAt:part.toolExecution.endTime}]:[]) ?? []).map(step=>({...step,messageIndex:index})));
  const anchor = requestAnchor(createdAt,steps);
  return steps.find(step=>step.id===anchor)?.messageIndex ?? candidates.find(row=>row.message.timestamp>=createdAt)?.index ?? candidates.at(-1)?.index ?? -1;
}
