import { useEffect } from 'react';

interface ClickAwayHandlerProps {
  isActive: boolean;
  onClickAway: () => void;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Reusable component for handling clicks outside of dropdowns/modals
 */
export default function ClickAwayHandler({ 
  isActive, 
  onClickAway, 
  children, 
  className = "fixed inset-0 z-40" 
}: ClickAwayHandlerProps) {
  useEffect(() => {
    if (!isActive) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClickAway();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onClickAway]);

  if (!isActive) return children ? <>{children}</> : null;

  return (
    <>
      {children}
      <div className={className} onClick={onClickAway} />
    </>
  );
}