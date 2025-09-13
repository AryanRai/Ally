import { cn } from '@/lib/utils';

interface AllyLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AllyLogo({ size = 'md', className }: AllyLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div
      className={cn(
        'relative rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg',
        sizeClasses[size],
        className
      )}
    >
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 opacity-75 animate-pulse" />
      <span className="relative z-10 text-lg font-bold">A</span>
    </div>
  );
}