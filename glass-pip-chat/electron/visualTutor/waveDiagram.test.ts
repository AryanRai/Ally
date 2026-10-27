// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { studyDiagramContent, waveDiagram } from './waveDiagram';
import { diagramDocument } from '../../src/visualTutor/DiagramFrame';

afterEach(() => { document.body.replaceChildren(); });
function mount(mode: 'waves' | 'fourier') {
  // Run exactly the card script after the same sanitization used by Study.
  const parsed = new DOMParser().parseFromString(diagramDocument(waveDiagram(mode)), 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
  const script = parsed.querySelector('script')!.textContent!;
  new Function(script)();
  return (id: string) => document.getElementById(id)!;
}
function change(id: string, value: string) {
  const control = document.getElementById(id) as HTMLInputElement;
  control.value = value;
  control.dispatchEvent(new Event('input'));
}
it('updates the real signal and equation immediately; reset restores the initial plot', () => {
  const el = mount('waves');
  const initial = el('wave').getAttribute('d');
  change('phase', '90');
  expect(el('wave').getAttribute('d')).not.toBe(initial);
  expect(el('formula').textContent).toContain('φ = 90°');
  change('amplitude', '0');
  expect(el('wave').getAttribute('d')!.match(/,144\.00/g)).toHaveLength(481);
  el('reset').click();
  expect(el('wave').getAttribute('d')).toBe(initial);
  expect(el('frequency').getAttribute('aria-label')).toBe('Frequency');
});
it('builds a bounded harmonic sum, switches target and handles maximum controls without invalid geometry', () => {
  const el = mount('fourier');
  expect(el('harmonics').children).toHaveLength(3);
  const initial = el('wave').getAttribute('d');
  change('terms', '12');
  expect(el('harmonics').children).toHaveLength(12);
  expect(el('wave').getAttribute('d')).not.toBe(initial);
  change('shape', 'sawtooth'); change('frequency', '4'); change('phase', '-180'); change('amplitude', '2');
  expect(el('formula').textContent).toContain('(−1)^(k+1)');
  for (const curve of document.querySelectorAll('path[d]')) expect(curve.getAttribute('d')).not.toMatch(/NaN|Infinity/);
  change('amplitude', '0');
  expect(el('wave').getAttribute('d')!.match(/,144\.00/g)).toHaveLength(481);
});
it('preserves custom diagrams and rejects ambiguous/unknown preset requests', () => {
  expect(studyDiagramContent({ html: '<p>Custom</p>' })).toBe('<p>Custom</p>');
  expect(studyDiagramContent({ preset: 'fourier' })).toContain('Number of terms');
  expect(() => studyDiagramContent({ preset: 'waves', html: 'x' })).toThrow('not both');
  expect(() => studyDiagramContent({ preset: '__proto__' })).toThrow('Choose');
  expect(() => studyDiagramContent({})).toThrow('Supply');
});
it('uses the Fourier sine-series coefficients and physical phase convention', () => {
  const el = mount('fourier');
  change('terms', '1');
  // t = 1/4, first square-wave term is 4/pi, mapped to the SVG ordinate.
  const points = el('wave').getAttribute('d')!.split(/[ML]/).filter(Boolean).map(pair => pair.split(',').map(Number));
  expect(points[60][1]).toBeCloseTo(144 - 43.2 * 4 / Math.PI, 2);
  change('shape', 'sawtooth');
  const saw = el('wave').getAttribute('d')!.split(/[ML]/).filter(Boolean).map(pair => pair.split(',').map(Number));
  expect(saw[60][1]).toBeCloseTo(144 - 43.2 * 2 / Math.PI, 2);
  change('phase', '90');
  expect(el('wave').getAttribute('d')!.startsWith('M40.00,' + (144 - 43.2 * 2 / Math.PI).toFixed(2))).toBe(true);
});
