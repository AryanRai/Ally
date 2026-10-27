import { describe, it, expect } from 'vitest';
import { physicalTapArrivalHtml } from './physicalTapVisual.js';
describe('local phone arrival display',()=>{
  it('is inert, honors reduced motion and identifies local review rather than delivery',()=>{
    expect(physicalTapArrivalHtml).toContain("default-src 'none'");
    expect(physicalTapArrivalHtml).toContain('prefers-reduced-motion');
    expect(physicalTapArrivalHtml).toContain('Choose a chat and Send on your phone');
    expect(physicalTapArrivalHtml).not.toMatch(/<script|https?:|<iframe|<img|onclick=/i);
  });
});
