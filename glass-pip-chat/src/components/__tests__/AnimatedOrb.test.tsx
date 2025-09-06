import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AnimatedOrb from '../AnimatedOrb';

describe('AnimatedOrb', () => {
  it('renders without crashing', () => {
    const { container } = render(<AnimatedOrb />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with different states', () => {
    const states = ['idle', 'listening', 'thinking', 'speaking', 'processing', 'ggwave'] as const;
    
    states.forEach(state => {
      const { container } = render(<AnimatedOrb state={state} isActive={true} />);
      expect(container.firstChild).toBeTruthy();
    });
  });

  it('renders with different sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    
    sizes.forEach(size => {
      const { container } = render(<AnimatedOrb size={size} />);
      expect(container.firstChild).toBeTruthy();
    });
  });

  it('applies custom className', () => {
    const { container } = render(<AnimatedOrb className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});