import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CompactMarkdown from './CompactMarkdown';
import { MessageResponse } from '../ai-elements/message';
const source = 'C:/Users/buzza/AppData/Local/Temp/portfolio-refresh/portfolio-live.jpg';
describe('local Markdown previews', () => {
  for (const [name, Component] of [['compact', CompactMarkdown], ['expanded', MessageResponse]] as const) {
    it(`loads a Windows image through validated IPC in ${name} chat`, async () => {
      const load = vi.fn().mockResolvedValue('data:image/jpeg;base64,aGVsbG8=');
      window.pip = { agent: { localImage: load } } as any;
      render(<Component>{`![Portfolio preview](${source})`}</Component>);
      await waitFor(() => expect(load).toHaveBeenCalledWith(source));
      expect(await screen.findByAltText('Portfolio preview')).toHaveAttribute('src', 'data:image/jpeg;base64,aGVsbG8=');
    });
  }
  it('shows a useful unavailable state for missing previews', async () => {
    window.pip = { agent: { localImage: vi.fn().mockRejectedValue(Error('missing')) } } as any;
    render(<CompactMarkdown>{`![Portfolio preview](${source})`}</CompactMarkdown>);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Preview unavailable'));
  });
});
