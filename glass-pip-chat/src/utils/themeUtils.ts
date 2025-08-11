import { cn } from '../lib/utils';

/**
 * Get consistent theme-based CSS classes for common UI elements
 */
export class ThemeUtils {
  static getTextClass(platform: string, theme: 'light' | 'dark', variant: 'primary' | 'secondary' | 'muted' = 'primary') {
    const baseClasses = {
      primary: platform === 'win32' ? "text-white/90" : theme === 'dark' ? "text-white/90" : "text-black/90",
      secondary: platform === 'win32' ? "text-white/80" : theme === 'dark' ? "text-white/80" : "text-black/80", 
      muted: platform === 'win32' ? "text-white/60" : theme === 'dark' ? "text-white/60" : "text-black/60"
    };
    return baseClasses[variant];
  }

  static getBackgroundClass(platform: string, theme: 'light' | 'dark', variant: 'base' | 'hover' | 'active' = 'base') {
    const baseClasses = {
      base: platform === 'win32' ? "bg-white/5" : theme === 'dark' ? "bg-white/5" : "bg-black/5",
      hover: platform === 'win32' ? "hover:bg-white/10" : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10",
      active: platform === 'win32' ? "bg-white/20" : theme === 'dark' ? "bg-white/20" : "bg-black/20"
    };
    return baseClasses[variant];
  }

  static getBorderClass(platform: string, theme: 'light' | 'dark') {
    return platform === 'win32' ? "border-white/10" : theme === 'dark' ? "border-white/10" : "border-black/10";
  }

  static getInputClass(platform: string, theme: 'light' | 'dark') {
    return cn(
      "border rounded transition-all focus:outline-none focus:ring-2",
      platform === 'win32' 
        ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
        : theme === 'dark'
          ? "bg-white/10 border-white/10 placeholder:text-white/40 focus:ring-white/20"
          : "bg-black/10 border-black/10 placeholder:text-black/40 focus:ring-black/20"
    );
  }

  static getButtonClass(platform: string, theme: 'light' | 'dark', variant: 'default' | 'primary' | 'danger' = 'default') {
    const baseClass = "px-3 py-1.5 rounded-lg transition-all";
    
    switch (variant) {
      case 'primary':
        return cn(baseClass, "bg-blue-500/20 hover:bg-blue-500/30 text-blue-300");
      case 'danger':
        return cn(baseClass, "bg-red-500/20 hover:bg-red-500/30 text-red-400");
      default:
        return cn(
          baseClass,
          platform === 'win32'
            ? "hover:bg-white/10"
            : theme === 'dark' ? "hover:bg-white/10" : "hover:bg-black/10"
        );
    }
  }

  static getModalClass(platform: string, theme: 'light' | 'dark') {
    return cn(
      "rounded-2xl border shadow-lg",
      platform === 'win32'
        ? "bg-black/90 border-white/20"
        : theme === 'dark'
          ? "bg-gray-900/95 border-white/20"
          : "bg-white/95 border-black/20"
    );
  }

  static getScrollbarClass(platform: string, theme: 'light' | 'dark') {
    return cn(
      "scrollbar-thin",
      platform === 'win32'
        ? "scrollbar-thumb-white/10"
        : theme === 'dark' ? "scrollbar-thumb-white/10" : "scrollbar-thumb-black/10"
    );
  }

  static getBorderRadiusClass(radius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl', platform?: string) {
    const radiusClasses = {
      none: 'rounded-none',
      sm: 'rounded-sm',
      md: 'rounded-md', 
      lg: 'rounded-lg',
      xl: 'rounded-xl',
      '2xl': 'rounded-2xl',
      '3xl': 'rounded-3xl'
    };
    
    // Use platform-specific defaults if provided
    if (platform === 'win32' && radius === '2xl') {
      return 'rounded-3xl'; // Windows prefers more rounded corners
    }
    
    return radiusClasses[radius];
  }
}