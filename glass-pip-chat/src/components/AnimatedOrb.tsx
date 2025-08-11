import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface AnimatedOrbProps {
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function AnimatedOrb({ 
  isActive = false, 
  size = 'sm',
  className 
}: AnimatedOrbProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  return (
    <motion.div
      className={cn(
        "rounded-full bg-gradient-to-r from-blue-400 to-purple-500 flex-shrink-0",
        sizeClasses[size],
        className
      )}
      animate={{
        scale: isActive ? [1, 1.2, 1] : 1,
        opacity: isActive ? [0.7, 1, 0.7] : 0.7,
      }}
      transition={{
        duration: isActive ? 2 : 0.3,
        repeat: isActive ? Infinity : 0,
        ease: "easeInOut"
      }}
    />
  );
}