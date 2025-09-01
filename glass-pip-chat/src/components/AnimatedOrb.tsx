import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

interface AnimatedOrbProps {
  isActive?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  state?: 'idle' | 'listening' | 'thinking' | 'speaking' | 'processing' | 'ggwave';
}

export default function AnimatedOrb({ 
  isActive = false, 
  size = 'sm',
  className,
  state = 'idle'
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

  // Animation configurations for different states
  const stateConfig = {
    idle: {
      colors: {
        glow: 'from-gray-400/10 via-gray-400/20 to-gray-500/10',
        core: 'from-slate-100 via-gray-200 to-gray-400',
        inner: 'from-gray-300/40 via-gray-400/30 to-gray-500/60'
      },
      animation: {
        duration: 4,
        glowOpacity: [0.1, 0.3, 0.1],
        scale: [1, 1.02, 1],
        particleSpeed: 0.5
      }
    },
    listening: {
      colors: {
        glow: 'from-blue-400/20 via-cyan-400/30 to-blue-500/20',
        core: 'from-blue-100 via-blue-200 to-blue-400',
        inner: 'from-blue-300/60 via-blue-400/40 to-blue-500/80'
      },
      animation: {
        duration: 2,
        glowOpacity: [0.3, 0.8, 0.3],
        scale: [0.95, 1.15, 0.95],
        particleSpeed: 2
      }
    },
    thinking: {
      colors: {
        glow: 'from-purple-400/20 via-violet-400/30 to-purple-500/20',
        core: 'from-purple-100 via-purple-200 to-purple-400',
        inner: 'from-purple-300/60 via-purple-400/40 to-purple-500/80'
      },
      animation: {
        duration: 3,
        glowOpacity: [0.4, 0.9, 0.4],
        scale: [1, 1.25, 1],
        particleSpeed: 1.5
      }
    },
    speaking: {
      colors: {
        glow: 'from-green-400/20 via-emerald-400/30 to-green-500/20',
        core: 'from-green-100 via-green-200 to-green-400',
        inner: 'from-green-300/60 via-green-400/40 to-green-500/80'
      },
      animation: {
        duration: 1.5,
        glowOpacity: [0.5, 1.0, 0.5],
        scale: [0.9, 1.1, 0.9],
        particleSpeed: 3
      }
    },
    processing: {
      colors: {
        glow: 'from-orange-400/20 via-yellow-400/30 to-orange-500/20',
        core: 'from-orange-100 via-orange-200 to-orange-400',
        inner: 'from-orange-300/60 via-orange-400/40 to-orange-500/80'
      },
      animation: {
        duration: 2.5,
        glowOpacity: [0.6, 1.1, 0.6],
        scale: [1, 1.3, 1],
        particleSpeed: 2.5
      }
    },
    ggwave: {
      colors: {
        glow: 'from-red-400/20 via-pink-400/30 to-red-500/20',
        core: 'from-red-100 via-red-200 to-red-400',
        inner: 'from-red-300/60 via-red-400/40 to-red-500/80'
      },
      animation: {
        duration: 1,
        glowOpacity: [0.7, 1.2, 0.7],
        scale: [0.8, 1.4, 0.8],
        particleSpeed: 4
      }
    }
  };

  const currentConfig = stateConfig[state] || stateConfig.idle;
  const shouldAnimate = isActive || state !== 'idle';

  return (
    <div className={cn("relative flex-shrink-0", className)}>
      {/* Ambient glow */}
      <motion.div
        className={cn(
          "absolute inset-0 rounded-full blur-md",
          `bg-gradient-to-r ${currentConfig.colors.glow}`
        )}
        style={{
          width: glowSizeClasses[size],
          height: glowSizeClasses[size],
          margin: `calc(-${glowSizeClasses[size].split(' ')[0]}/4)`
        }}
        animate={{
          opacity: shouldAnimate ? currentConfig.animation.glowOpacity : 0.2,
          scale: shouldAnimate ? currentConfig.animation.scale : 1,
        }}
        transition={{
          duration: shouldAnimate ? currentConfig.animation.duration : 0.5,
          repeat: shouldAnimate ? Infinity : 0,
          ease: "easeInOut"
        }}
      />

      {/* Main orb core with realistic lighting */}
      <motion.div
        className={cn(
          "relative rounded-full",
          `bg-gradient-to-br ${currentConfig.colors.core}`,
          "shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),inset_0_-1px_2px_rgba(0,0,0,0.1),0_0_8px_rgba(59,130,246,0.3)]",
          sizeClasses[size]
        )}
        animate={{
          scale: shouldAnimate ? currentConfig.animation.scale : 1,
          boxShadow: shouldAnimate 
            ? [
                "inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1), 0 0 8px rgba(59,130,246,0.3)",
                "inset 0 1px 2px rgba(255,255,255,0.9), inset 0 -1px 2px rgba(0,0,0,0.05), 0 0 12px rgba(59,130,246,0.5), 0 0 20px rgba(147,51,234,0.2)",
                "inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1), 0 0 8px rgba(59,130,246,0.3)"
              ]
            : "inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1), 0 0 8px rgba(59,130,246,0.3)",
        }}
        transition={{
          duration: shouldAnimate ? currentConfig.animation.duration : 0.3,
          repeat: shouldAnimate ? Infinity : 0,
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
            opacity: shouldAnimate ? [0.7, 1, 0.7] : 0.8,
            scale: shouldAnimate ? [0.8, 1.2, 0.8] : 1,
          }}
          transition={{
            duration: shouldAnimate ? currentConfig.animation.duration * 0.7 : 0.3,
            repeat: shouldAnimate ? Infinity : 0,
            ease: "easeInOut"
          }}
        />

        {/* Inner depth and volume */}
        <motion.div
          className={cn(
            "absolute inset-0.5 rounded-full",
            `bg-gradient-to-br ${currentConfig.colors.inner}`
          )}
          animate={{
            opacity: shouldAnimate ? [0.4, 0.7, 0.4] : 0.3,
          }}
          transition={{
            duration: shouldAnimate ? currentConfig.animation.duration * 0.8 : 0.3,
            repeat: shouldAnimate ? Infinity : 0,
            ease: "easeInOut"
          }}
        />

        {/* Subtle energy particles */}
        {shouldAnimate && Array.from({ length: particleCount[size] }).map((_, i) => (
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
              duration: currentConfig.animation.duration,
              repeat: Infinity,
              delay: (i * 0.8) / currentConfig.animation.particleSpeed,
              ease: "easeInOut"
            }}
          />
        ))}

        {/* Subtle energy field */}
        {shouldAnimate && (
          <motion.div
            className="absolute inset-0 rounded-full border border-blue-300/30"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0, 0.3],
            }}
            transition={{
              duration: currentConfig.animation.duration,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />
        )}
      </motion.div>

      {/* Subtle floating energy */}
      {shouldAnimate && (
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
            duration: currentConfig.animation.duration * 0.6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
    </div>
  );
}