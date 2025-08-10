import GlassChatPiP from "@/components/glass-chat-pip"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-retro-green/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-retro-cyan/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Demo content */}
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="max-w-4xl mx-auto">
                      <div className="text-center mb-16">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-retro-green via-retro-cyan to-retro-blue bg-clip-text text-transparent mb-6 font-mono">
                ALLY // AI ASSISTANT
              </h1>
              <p className="text-xl text-purple-200/80 mb-8 font-medium">
                A technical, minimal AI interface designed for developers and power users.
              </p>
              <div className="flex justify-center gap-4 mb-8">
                <a
                  href="/ally"
                  className="px-6 py-3 bg-gradient-to-r from-retro-green/20 to-retro-cyan/20 border border-retro-green/30 rounded-lg hover:from-retro-green/30 hover:to-retro-cyan/30 transition-all duration-300 text-retro-green font-mono"
                >
                  Remote Monitor
                </a>
              </div>
            <div className="flex flex-wrap gap-6 justify-center text-sm text-purple-300/70">
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 bg-retro-green rounded-full animate-pulse" />
                Drag to move
              </span>
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 bg-retro-cyan rounded-full animate-pulse delay-200" />
                Resize with S/M/L
              </span>
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 bg-retro-blue rounded-full animate-pulse delay-500" />
                Smart corner snapping
              </span>
              <span className="flex items-center gap-2">
                <div className="w-2 h-2 bg-retro-green rounded-full animate-pulse delay-700" />
                Press ESC to close
              </span>
            </div>
          </div>

          {/* Demo content cards */}
          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <div
              className="
            bg-gray-800/40 
            backdrop-blur-lg 
            border border-retro-green/20
            rounded-3xl p-8 
            shadow-2xl shadow-retro-green/10
            relative
            overflow-hidden
          "
            >
              <div className="absolute inset-0 bg-gradient-to-br from-retro-green/5 to-retro-cyan/5" />
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-purple-100 mb-6 font-mono">// FEATURES</h3>
                <ul className="space-y-3 text-purple-200/80 font-mono text-sm">
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-green rounded-full" />
                    Advanced glassmorphism rendering
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-cyan rounded-full" />
                    Real-time UTC timestamps
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-blue rounded-full" />
                    Neon glow hover effects
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-green rounded-full" />
                    Thinking backdrop animations
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-cyan rounded-full" />
                    Minimal, icon-free interface
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-blue rounded-full" />
                    Technical status monitoring
                  </li>
                </ul>
              </div>
            </div>

            <div
              className="
            bg-gray-800/40 
            backdrop-blur-lg 
            border border-retro-green/20
            rounded-3xl p-8 
            shadow-2xl shadow-retro-green/10
            relative
            overflow-hidden
          "
            >
              <div className="absolute inset-0 bg-gradient-to-br from-retro-cyan/5 to-retro-green/5" />
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-purple-100 mb-6 font-mono">// CONTROLS</h3>
                <ul className="space-y-3 text-purple-200/80 font-mono text-sm">
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-cyan rounded-full" />
                    Drag header to reposition
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-green rounded-full" />
                    Collapse for minimal mode
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-cyan rounded-full" />
                    CTRL+ENTER to execute
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-green rounded-full" />
                    ESC to terminate session
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-cyan rounded-full" />
                    Neon glow on interaction
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-retro-green rounded-full" />
                    Real-time status updates
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Tech stack */}
          <div className="text-center">
            <h3 className="text-xl font-bold text-purple-100 mb-6">Built with Future Tech</h3>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              {[
                "React 18",
                "TypeScript",
                "Tailwind CSS",
                "Framer Motion",
                "CSS Backdrop Filter",
                "Modern Glassmorphism",
              ].map((tech) => (
                <span
                  key={tech}
                  className="
                px-4 py-2 
                bg-gray-800/50 
                backdrop-blur-sm
                border border-retro-green/20
                rounded-2xl
                text-retro-green
                font-medium
                hover:bg-gray-700/50
                hover:border-retro-green/30
                transition-all duration-300
              "
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chat PiP Component */}
      <GlassChatPiP />
    </main>
  )
}
