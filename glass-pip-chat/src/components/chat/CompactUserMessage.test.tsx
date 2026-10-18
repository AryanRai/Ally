import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import CompactUserMessage from './CompactUserMessage';

afterEach(cleanup);
it('renders the human answer and keeps protocol IDs out of visible content', () => {
  render(<CompactUserMessage content={'<send_user_message_question_reply>[{"questionItemId":"call_private","question":"Which mode?","answer":"Meeting notes"}]</send_user_message_question_reply>'} />);
  expect(screen.getByText('You answered')).toBeInTheDocument();
  expect(screen.getByText('Meeting notes')).toBeVisible();
  expect(screen.getByText('Question details')).toBeInTheDocument();
  expect(screen.queryByText(/call_private|questionItemId|send_user_message/)).not.toBeInTheDocument();
});
it('renders markdown instead of exposing formatting syntax in the top preview', () => {
  const { container } = render(<CompactUserMessage content="Please use **meeting notes**." />);
  expect(container.querySelector('strong')).toHaveTextContent('meeting notes');
  expect(container.textContent).not.toContain('**');
});
