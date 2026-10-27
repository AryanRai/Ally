import { expect, it } from 'vitest';
import { studyReasoning } from './studyReasoning';

it('reserves low for routine requests and keeps uncertain visual teaching smart', () => {
  expect(studyReasoning('Hi')).toBe('low');
  expect(studyReasoning('Read this aloud')).toBe('low');
  expect(studyReasoning('Explain this image', '{"widthInPixels":1920}')).toBe('medium');
  expect(studyReasoning('What is going on here?')).toBe('medium');
});
it('routes hard reasoning and technical image context to high without changing models', () => {
  for (const question of ['Derive the 2D Fourier transform', 'Fix the browser connection', 'Explain step by step', 'Compare these approaches', 'Solve this equation']) expect(studyReasoning(question)).toBe('high');
  expect(studyReasoning('Explain this', '{"highlight":{"text":"∫ f(x) dx"}}')).toBe('high');
});
