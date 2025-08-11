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

  const glowSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const particleCount = {
    sm: 2,
    md: 3,
    lg: 4
  };

  return (
    <div className={cn("relative flex-shrink-0", className)}>
      {/* Ambient glow */}
      <motion.div
        className={cn(
          "absolute inset-0 rounded-full",
          "bg-gradient-to-r from-blue-400/20 via-cyan-400/30 to-blue-500/20",
          "blur-md"
        )}
        style={{
          width: glowSizeClasses[size],
          height: glowSizeClasses[size],
          margin: `calc(-${glowSizeClasses[size].split(' ')[0]}/4)`
        }}
        animate={{
          opacity: isActive ? [0.3, 0.6, 0.3] : 0.2,
          scale: isActive ? [1, 1.1, 1] : 1,
        }}
        transition={{
          duration: isActive ? 4 : 0.5,
          repeat: isActive ? Infinity : 0,
          ease: "easeInOut"
        }}
      />

      {/* Main orb core with realistic lighting */}
      <motion.div
        className={cn(
          "relative rounded-full",
          "bg-gradient-to-br from-slate-100 via-blue-200 to-blue-400",
          "shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(0,0,0,0.1),0_0_8px_rgba(59,130,246,0.3)]",
          sizeClasses[size]
        )}
        animate={{
          scale: isActive ? [1, 1.05, 1] : 1,
          boxShadow: isActive 
            ? [
                "inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1), 0 0 8px rgba(59,130,246,0.3)",
                "inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(0,0,0,0.05), 0 0 12px rgba(59,130,246,0.5), 0 0 20px rgba(147,51,234,0.2)",
                "inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1), 0 0 8px rgba(59,130,246,0.3)"
              ]
            : "inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1), 0 0 8px rgba(59,130,246,0.3)",
        }}
        transition={{
          duration: isActive ? 3 : 0.3,
          repeat: isActive ? Infinity : 0,
          ease: "easeInOut"
        }}
      >
        {/* Specular highlight */}
        <motion.div
          className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-white/90"
          style={{
            filter: 'blur(0.5px)',
          }}
          animate={{
            opacity: isActive ? [0.7, 1, 0.7] : 0.8,
            scale: isActive ? [0.8, 1.2, 0.8] : 1,
          }}
          transition={{
            duration: isActive ? 2 : 0.3,
            repeat: isActive ? Infinity : 0,
            ease: "easeInOut"
          }}
        />

        {/* Inner depth and volume */}
        <motion.div
          className="absolute inset-0.5 rounded-full bg-gradient-to-br from-blue-300/60 via-blue-400/40 to-blue-500/80"
          animate={{
            opacity: isActive ? [0.4, 0.7, 0.4] : 0.3,
          }}
          transition={{
            duration: isActive ? 2.5 : 0.3,
            repeat: isActive ? Infinity : 0,
            ease: "easeInOut"
          }}
        />

        {/* Subtle energy particles */}
        {isActive && Array.from({ length: particleCount[size] }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white/60 rounded-full"
            style={{
              left: '50%',
              top: '50%',
              marginLeft: '-0.125rem',
              marginTop: '-0.125rem',
              filter: 'blur(0.3px)',
            }}
            animate={{
              x: [
                Math.cos((i * 2 * Math.PI) / particleCount[size]) * 6,
                Math.cos((i * 2 * Math.PI) / particleCount[size] + Math.PI * 0.5) * 6,
                Math.cos((i * 2 * Math.PI) / particleCount[size]) * 6,
              ],
              y: [
                Math.sin((i * 2 * Math.PI) / particleCount[size]) * 6,
                Math.sin((i * 2 * Math.PI) / particleCount[size] + Math.PI * 0.5) * 6,
                Math.sin((i * 2 * Math.PI) / particleCount[size]) * 6,
              ],
              opacity: [0, 0.8, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: (i * 0.8),
              ease: "easeInOut"
            }}
          />
        ))}

        {/* Subtle energy field */}
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-full border border-blue-300/30"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0, 0.3],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
        )}
      </motion.div>

      {/* Subtle floating energy */}
      {isActive && (
        <motion.div
          className="absolute -top-0.5 -right-0.5 w-0.5 h-0.5 bg-blue-300/70 rounded-full"
          style={{
            filter: 'blur(0.5px)',
          }}
          animate={{
            y: [-1, 1, -1],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
    </div>
  );
}