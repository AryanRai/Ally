import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import CompactMarkdown from './CompactMarkdown';
import { MessageResponse } from '../ai-elements/message';
import { mathMarkdown } from '@/lib/mathMarkdown';
afterEach(cleanup);
const expression = String.raw`These are the projection equations:
\[ x=\frac{fX}{Z},\qquad y=\frac{fY}{Z} \]
The point is \((X,Y,Z)\), with inline $f > 0$.`;
it.each([false, true])('renders LaTeX in compact and expanded replies (expanded=%s)', expanded => {
  const { container } = render(expanded ? <MessageResponse>{expression}</MessageResponse> : <CompactMarkdown>{expression}</CompactMarkdown>);
  expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3);
  expect(container.querySelector('.katex-display')).not.toBeNull();
  expect(container.querySelector('math')).not.toBeNull();
});
it('leaves inline/fenced code, ordinary links, incomplete streaming delimiters and currency alone', () => {
  const text = 'A $20 price. [link](https://example.com) `\\(code\\)`\n```tex\n\\[x\\]\n```\n\\[pending';
  expect(mathMarkdown(text)).toBe(text);
  const { container } = render(<CompactMarkdown>{text}</CompactMarkdown>);
  expect(container.querySelector('code')?.textContent).toContain('\\(code\\)');
  expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com');
});
it('renders malformed LaTeX as a safe visible error and never trusts executable math commands', () => {
  const { container } = render(<CompactMarkdown>{String.raw`$$\badcommand{x}$$ and $\href{javascript:alert(1)}{click}$`}</CompactMarkdown>);
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(container.textContent).not.toBe('');
});
