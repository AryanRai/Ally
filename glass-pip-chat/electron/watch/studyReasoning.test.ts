import { expect, it } from 'vitest';
import { studyReasoning } from './studyReasoning';

it('reserves low for routine requests and keeps uncertain visual teaching smart', () => {
  expect(studyReasoning('Hi')).toBe('low');
  expect(studyReasoning('Read this aloud')).toBe('low');
  expect(studyReasoning('Explain this image', '{"widthInPixels":1920}')).toBe('medium');
  expect(studyReasoning('What is going on here?')).toBe('medium');
});
it('does not turn quiz acknowledgements into hard maths because of screen context', () => {
  const context=JSON.stringify({highlight:{text:'DFT ∑ x'}, scene:'∫ f(x) dx', narration:'Fourier transform'});
  for(const words of ['No.', 'Yes', 'I don’t know.', 'Continue', 'Read this aloud']) expect(studyReasoning(words,context)).toBe('low');
  for(const words of ['Why does it blur?', 'What is thermal noise?', 'Explain the Fourier idea', 'How does this mechanism work?']) expect(studyReasoning(words,JSON.stringify({scene:'∫',narration:'DFT'}))).toBe('medium');
  expect(studyReasoning('Explain this',JSON.stringify({scene:'∫',narration:'DFT'}))).toBe('medium');
  expect(studyReasoning('Explain this','invalid DFT context')).toBe('medium');
  expect(studyReasoning('No, derive the correct answer',context)).toBe('high');
});
it('routes hard reasoning and technical image context to high without changing models', () => {
  for (const question of ['Derive the 2D Fourier transform', 'Fix the browser connection', 'Explain step by step', 'Compare these approaches', 'Solve this equation']) expect(studyReasoning(question)).toBe('high');
  expect(studyReasoning('Explain this', '{"highlight":{"text":"∫ f(x) dx"}}')).toBe('high');
});
