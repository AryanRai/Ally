import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        glass: {
          light: "rgba(0, 230, 118, 0.15)", // Neon Green tint
          dark: "rgba(17, 24, 39, 0.8)", // Dark gray with opacity
          border: {
            light: "rgba(0, 230, 118, 0.3)",
            dark: "rgba(0, 230, 118, 0.2)",
          },
          highlight: {
            light: "rgba(0, 191, 255, 0.4)", // Bright Cyan highlight
            dark: "rgba(0, 191, 255, 0.3)",
          },
        },
        purple: {
          50: "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          300: "#d8b4fe",
          400: "#c084fc",
          500: "#a855f7",
          600: "#9333ea",
          700: "#7c3aed",
          800: "#6b21a8",
          900: "#581c87",
          950: "#1e1b4b",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        retro: {
          green: "var(--retro-green)",
          cyan: "var(--retro-cyan)",
          blue: "var(--retro-blue)",
          purple: "var(--retro-purple)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backdropBlur: {
        glass: "20px",
        "glass-strong": "32px",
      },
      boxShadow: {
        glass:
          "0 8px 32px rgba(0, 230, 118, 0.15), 0 2px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        "glass-dark":
          "0 8px 32px rgba(0, 230, 118, 0.25), 0 2px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(0, 230, 118, 0.2)",
        "glass-lift": "0 12px 40px rgba(0, 230, 118, 0.2), 0 4px 20px rgba(0, 0, 0, 0.15)",
        "neon-purple": "0 0 20px rgba(139, 92, 246, 0.5), 0 0 40px rgba(139, 92, 246, 0.3)",
        "retro-glow": "0 0 20px var(--retro-green), 0 0 40px var(--retro-cyan), 0 0 60px var(--retro-blue)",
      },
      animation: {
        "bounce-gentle": "bounce-gentle 0.6s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "flow-border": "flow-border 2s linear infinite",
      },
      keyframes: {
        "bounce-gentle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
        "flow-border": {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "100% 0%" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
