import { Profiler, type ComponentType } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import WatchReplyContent from './WatchReplyContent';

afterEach(cleanup);

// Opt-in, synthetic CPU profile. Uses the real reply/Markdown tree, no bridge or model.
it.skipIf(!process.env.ALLY_REPLY_PROFILE).each([
  { compact: false, memoized: false }, { compact: false, memoized: true },
  { compact: true, memoized: false }, { compact: true, memoized: true },
])('profiles unchanged history during incremental replies (%j)', ({ compact, memoized }) => {
  const Reply = memoized ? WatchReplyContent : (WatchReplyContent as unknown as { type: ComponentType<{ content: string; compact: boolean; streaming?: boolean }> }).type;
  const history = Array.from({ length: 40 }, (_, i) =>
    `## Reply ${i}\n\nA **saved answer** with [a link](https://example.com).\n\n- First item\n- Second item\n\n| Key | Value |\n| --- | --- |\n| result | preserved |\n\nParagraph with inline \`code\` and more text.`);
  const durations: number[] = [];
  const tree = (step: number) => <Profiler id="replies" onRender={(_, phase, duration) => {
    if (phase === 'update') durations.push(duration);
  }}><div>{history.map((content, i) => <Reply key={i} content={content} compact={compact} />)}
    <Reply content={'Streaming answer. '.repeat(step + 1)} streaming compact={compact} />
  </div></Profiler>;
  const { rerender, container } = render(tree(0));
  const original = container.firstElementChild!.firstElementChild;
  const savedMarkup = original!.outerHTML;
  durations.length = 0;
  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  for (let step = 1; step <= 24; step++) rerender(tree(step));
  const wallMs = performance.now() - wallStart;
  const cpu = process.cpuUsage(cpuStart);
  expect(container.firstElementChild!.firstElementChild).toBe(original);
  expect(original!.outerHTML).toBe(savedMarkup);
  const sorted = [...durations].sort((a, b) => a - b);
  console.log(JSON.stringify({ compact, memoized, updates: durations.length, totalRenderMs: durations.reduce((a, b) => a + b, 0), medianRenderMs: sorted[Math.floor(sorted.length / 2)], p95RenderMs: sorted[Math.floor(sorted.length * .95)], wallMs, processCpuMs: (cpu.user + cpu.system) / 1000, heapUsedBytes: process.memoryUsage().heapUsed }));
}, 30000);
