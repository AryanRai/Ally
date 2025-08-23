"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import { X, Maximize2, Minimize2 } from "lucide-react"

// Types
interface Message {
  id: string
  content: string
  isUser: boolean
  timestamp: Date
}

interface Position {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

type SizeVariant = "S" | "M" | "L"

const SIZE_PRESETS: Record<SizeVariant, Size> = {
  S: { width: 320, height: 400 },
  M: { width: 450, height: 550 },
  L: { width: 600, height: 750 },
}

const STORAGE_KEY = "glass-chat-pip-state"
const SNAP_THRESHOLD = 50
const CORNER_GUTTER = 12

export default function GlassChatPiP() {
  // State management
  const [isOpen, setIsOpen] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDocked, setIsDocked] = useState(false)
  const [sizeVariant, setSizeVariant] = useState<SizeVariant>("M")
  const [position, setPosition] = useState<Position>({ x: 50, y: 50 })
  const [size, setSize] = useState<Size>(SIZE_PRESETS.M)
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null)

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const dragConstraintsRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load saved state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const state = JSON.parse(saved)
        setPosition(state.position || { x: 50, y: 50 })
        setSize(state.size || SIZE_PRESETS.M)
        setSizeVariant(state.sizeVariant || "M")
        setIsCollapsed(state.isCollapsed || false)
        setIsDocked(state.isDocked || false)
      } catch (e) {
        console.warn("Failed to load saved chat state")
      }
    }
  }, [])

  // Save state to localStorage
  const saveState = useCallback(() => {
    const state = {
      position,
      size,
      sizeVariant,
      isCollapsed,
      isDocked,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [position, size, sizeVariant, isCollapsed, isDocked])

  useEffect(() => {
    saveState()
  }, [saveState])

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  // Snap to corners logic
  const snapToCorner = useCallback((currentPos: Position, containerSize: Size) => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    }

    const corners = [
      { x: CORNER_GUTTER, y: CORNER_GUTTER }, // Top-left
      { x: viewport.width - containerSize.width - CORNER_GUTTER, y: CORNER_GUTTER }, // Top-right
      { x: CORNER_GUTTER, y: viewport.height - containerSize.height - CORNER_GUTTER }, // Bottom-left
      {
        x: viewport.width - containerSize.width - CORNER_GUTTER,
        y: viewport.height - containerSize.height - CORNER_GUTTER,
      }, // Bottom-right
    ]

    let closestCorner = corners[0]
    let minDistance = Number.POSITIVE_INFINITY

    corners.forEach((corner) => {
      const distance = Math.sqrt(Math.pow(currentPos.x - corner.x, 2) + Math.pow(currentPos.y - corner.y, 2))
      if (distance < minDistance) {
        minDistance = distance
        closestCorner = corner
      }
    })

    return minDistance < SNAP_THRESHOLD ? closestCorner : currentPos
  }, [])

  // Handle drag end
  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      const newPosition = {
        x: position.x + info.offset.x,
        y: position.y + info.offset.y,
      }

      const snappedPosition = snapToCorner(newPosition, size)
      setPosition(snappedPosition)
    },
    [position, size, snapToCorner],
  )

  // Handle size change
  const handleSizeChange = (variant: SizeVariant) => {
    setSizeVariant(variant)
    setSize(SIZE_PRESETS[variant])
  }

  // Toggle collapse
  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  // Toggle dock mode
  const toggleDock = () => {
    setIsDocked(!isDocked)
    if (!isDocked) {
      setIsCollapsed(true)
    }
  }

  // Handle message send (mock)
  const handleSend = () => {
    if (!inputValue.trim()) return
    setIsLoading(true)
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false)
      setInputValue("")
    }, 1500)
  }

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  if (!isOpen) return null

  return (
    <>
      {/* Viewport container for drag constraints */}
      <div ref={dragConstraintsRef} className="fixed inset-0 pointer-events-none z-40" style={{ zIndex: 9999 }} />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={containerRef}
            className="fixed z-50 select-none group"
            style={{
              zIndex: 10000,
              x: position.x,
              y: position.y,
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            drag
            dragConstraints={dragConstraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            whileHover={{
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.15), 0 4px 20px rgba(0, 0, 0, 0.1)",
              transition: { duration: 0.2 },
            }}
            role="dialog"
            aria-modal="false"
            aria-labelledby="chat-title"
          >
            {/* Animated Border Light Effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
              <div className="absolute inset-0 rounded-3xl overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, var(--retro-green), var(--retro-cyan), var(--retro-blue), var(--retro-green), transparent)",
                    backgroundSize: "200% 100%",
                    animation: "flow-border 2s linear infinite",
                    mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    maskComposite: "xor",
                    padding: "2px",
                  }}
                />
              </div>
            </div>
            {/* Docked/Pill Mode */}
            {isDocked ? (
              <motion.div
                className="
      bg-gray-900/95 
      backdrop-blur-glass-strong
      border border-purple-500/30
      rounded-2xl
      shadow-neon-purple
      px-4 py-2
      flex items-center justify-between
      cursor-pointer
      hover:border-purple-400/60
      transition-all duration-300
      relative
      overflow-hidden
      group
    "
                style={{ width: size.width, height: 48 }}
                onClick={() => setIsDocked(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setIsDocked(false)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label="Expand Ally"
                whileHover={{
                  boxShadow:
                    "0 0 30px rgba(139, 92, 246, 0.6), 0 0 60px rgba(236, 72, 153, 0.3), 0 0 90px rgba(59, 130, 246, 0.2)",
                  borderColor: "rgba(139, 92, 246, 0.8)",
                }}
                whileTap={{ scale: 0.98 }}
              >
                {/* RGB Glow Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-pink-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative z-10 flex items-center justify-between w-full">
                  <div>
                    <span className="text-sm font-bold text-purple-100 font-mono">ALLY</span>
                    <span className="text-xs text-purple-300/70 ml-2 font-mono">
                      {new Date().toLocaleTimeString([], { hour12: false })}
                    </span>
                  </div>
                  <div className="text-xs text-purple-300/50 font-mono">READY</div>
                </div>
              </motion.div>
            ) : (
              /* Full Chat Window */
              <motion.div
                className="
    bg-gray-900/95
    backdrop-blur-glass-strong
    border border-retro-green/30
    rounded-3xl
    shadow-retro-glow
    overflow-hidden
    flex flex-col
    relative
    [@supports(not(backdrop-filter:blur()))]:bg-gray-900/98
  "
                style={{
                  width: size.width,
                  height: isCollapsed ? Math.min(84, size.height * 0.15) : size.height,
                }}
                layout
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* Futuristic glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 via-transparent to-violet-600/10 pointer-events-none rounded-3xl" />
                <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-purple-500/5 pointer-events-none rounded-3xl" />

                {/* Header */}
                <div
                  className="
    relative z-10
    flex items-center justify-between 
    backdrop-blur-sm
    cursor-move
    bg-gradient-to-r from-retro-green/30 via-gray-900/50 to-retro-cyan/30
    border-b border-retro-green/20
  "
                  style={{
                    padding: size.width < 400 ? "0.75rem" : size.width < 500 ? "1rem" : "1.5rem",
                  }}
                >
                  <div className="flex items-center" style={{ gap: size.width < 400 ? "0.5rem" : "1rem" }}>
                    {/* Animated Visualizer Icon */}
                    <div
                      className="
        bg-gradient-to-br from-retro-green via-retro-cyan to-retro-blue
        rounded-2xl 
        flex items-center justify-center
        shadow-lg
        relative
        overflow-hidden
        font-mono
        text-white
        font-bold
        flex-shrink-0
      "
                      style={{
                        width: size.width < 400 ? "1.75rem" : "2.5rem",
                        height: size.width < 400 ? "1.75rem" : "2.5rem",
                      }}
                    >
                      {/* Inner glow */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
                      <div className="flex items-end h-full w-full justify-around p-1 relative z-10">
                        {[...Array(5)].map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-1 rounded-full bg-white"
                            style={{
                              height: "100%",
                              originY: "bottom",
                            }}
                            animate={isLoading ? { scaleY: [0.3, 1, 0.3] } : { scaleY: 0.5 }}
                            transition={{
                              duration: 0.6,
                              repeat: isLoading ? Number.POSITIVE_INFINITY : 0,
                              ease: "easeInOut",
                              delay: i * 0.1,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="min-w-0 flex-shrink">
                      <h2
                        id="chat-title"
                        className="font-bold text-purple-100 font-mono leading-tight"
                        style={{ fontSize: size.width < 400 ? "0.75rem" : "1rem" }}
                      >
                        ALLY
                      </h2>
                      <p
                        className="text-purple-300/70 font-mono leading-tight"
                        style={{ fontSize: size.width < 400 ? "0.625rem" : "0.75rem" }}
                      >
                        {new Date().toLocaleTimeString([], { hour12: false })} UTC
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center flex-shrink-0"
                    style={{ gap: size.width < 400 ? "0.25rem" : "0.75rem" }}
                  >
                    {/* Quick Input - Only in collapsed mode */}
                    {isCollapsed && (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              handleSend()
                            }
                          }}
                          placeholder={isLoading ? "..." : "cmd..."}
                          disabled={isLoading}
                          style={{
                            width: Math.max(80, size.width * 0.3),
                            fontSize: size.width < 400 ? "0.625rem" : "0.75rem",
                            padding: size.width < 400 ? "0.25rem 0.5rem" : "0.375rem 0.75rem",
                          }}
                          className="
            bg-gray-800/60
            backdrop-blur-sm
            border border-retro-green/30
            rounded-xl
            placeholder-retro-green/50
            text-retro-green-50
            focus:outline-none focus:ring-1 focus:ring-retro-green/50 focus:border-retro-green/50
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-300
            font-mono
            hover:border-retro-green/50
          "
                        />
                        <button
                          onClick={handleSend}
                          disabled={!inputValue.trim() || isLoading}
                          style={{
                            width: size.width < 400 ? "1.5rem" : "2rem",
                            height: size.width < 400 ? "1.5rem" : "2rem",
                          }}
                          className="
            rounded-xl
            bg-gradient-to-br from-retro-green to-retro-cyan
            hover:from-retro-green/80 hover:to-retro-cyan/80
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center
            transition-all duration-300
            focus:outline-none focus:ring-1 focus:ring-retro-green/50
            shadow-md shadow-retro-green/25
            hover:shadow-lg hover:shadow-retro-green/40
            hover:scale-105
            relative
            overflow-hidden
            group
            flex-shrink-0
          "
                          aria-label="Execute quick command"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                          <div className="absolute inset-0 bg-gradient-to-r from-retro-green/0 via-retro-cyan/0 to-retro-blue/0 group-hover:from-retro-green/20 group-hover:via-retro-cyan/20 group-hover:to-retro-blue/20 transition-all duration-500" />
                          <span
                            className="font-mono font-bold text-white relative z-10"
                            style={{ fontSize: size.width < 400 ? "0.625rem" : "0.75rem" }}
                          >
                            {isLoading ? "..." : "→"}
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Size Controls */}
                    <div
                      className="flex items-center bg-gray-800/50 rounded-2xl border border-purple-500/20"
                      style={{
                        gap: "0.125rem",
                        padding: size.width < 400 ? "0.125rem" : "0.25rem",
                      }}
                    >
                      {(["S", "M", "L"] as SizeVariant[]).map((variant) => (
                        <button
                          key={variant}
                          onClick={() => handleSizeChange(variant)}
                          style={{
                            width: size.width < 400 ? "1.5rem" : "2rem",
                            height: size.width < 400 ? "1.5rem" : "2rem",
                            fontSize: size.width < 400 ? "0.625rem" : "0.75rem",
                          }}
                          className={`
            rounded-xl font-bold
            transition-all duration-300
            ${
              sizeVariant === variant
                ? "bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-lg scale-105"
                : "text-purple-300 hover:bg-purple-500/20 hover:text-purple-200"
            }
          `}
                          aria-label={`Set size to ${variant}`}
                        >
                          {variant}
                        </button>
                      ))}
                    </div>

                    {/* Controls */}
                    <button
                      onClick={toggleCollapse}
                      style={{
                        width: size.width < 400 ? "1.75rem" : "2.5rem",
                        height: size.width < 400 ? "1.75rem" : "2.5rem",
                      }}
                      className="
        rounded-2xl
        bg-gray-800/50 hover:bg-gray-700/50
        border border-purple-500/20 hover:border-purple-400/40
        flex items-center justify-center
        transition-all duration-300
        hover:shadow-lg hover:shadow-purple-500/25
        flex-shrink-0
      "
                      aria-label={isCollapsed ? "Expand" : "Collapse"}
                    >
                      {isCollapsed ? (
                        <Maximize2
                          style={{
                            width: size.width < 400 ? "0.875rem" : "1rem",
                            height: size.width < 400 ? "0.875rem" : "1rem",
                          }}
                          className="text-purple-300"
                        />
                      ) : (
                        <Minimize2
                          style={{
                            width: size.width < 400 ? "0.875rem" : "1rem",
                            height: size.width < 400 ? "0.875rem" : "1rem",
                          }}
                          className="text-purple-300"
                        />
                      )}
                    </button>

                    <button
                      onClick={() => setIsOpen(false)}
                      style={{
                        width: size.width < 400 ? "1.75rem" : "2.5rem",
                        height: size.width < 400 ? "1.75rem" : "2.5rem",
                      }}
                      className="
        rounded-2xl
        bg-red-500/20 hover:bg-red-500/30
        border border-red-500/30 hover:border-red-400/50
        flex items-center justify-center
        transition-all duration-300
        hover:shadow-lg hover:shadow-red-500/25
        flex-shrink-0
      "
                      aria-label="Close chat"
                    >
                      <X
                        style={{
                          width: size.width < 400 ? "0.875rem" : "1rem",
                          height: size.width < 400 ? "0.875rem" : "1rem",
                        }}
                        className="text-red-300"
                      />
                    </button>
                  </div>
                </div>

                {/* Body - Input Focus */}
                {!isCollapsed && (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    {/* Status Bar */}
                    <div
                      className="border-b border-purple-500/10 bg-gray-900/50"
                      style={{
                        padding: size.width < 400 ? "0.5rem 0.75rem" : "0.75rem 1.5rem",
                      }}
                    >
                      <div
                        className="flex items-center justify-between font-mono"
                        style={{
                          fontSize: size.width < 400 ? "0.625rem" : "0.75rem",
                          gap: size.width < 400 ? "0.5rem" : "1rem",
                        }}
                      >
                        <div className="flex items-center" style={{ gap: size.width < 400 ? "0.5rem" : "1rem" }}>
                          <span className="text-purple-300/70">STATUS:</span>
                          <span className="text-green-400">ONLINE</span>
                        </div>
                        <div className="flex items-center" style={{ gap: size.width < 400 ? "0.5rem" : "1rem" }}>
                          <span className="text-purple-300/70">LAT:</span>
                          <span className="text-blue-400">12ms</span>
                        </div>
                        <div className="flex items-center" style={{ gap: size.width < 400 ? "0.5rem" : "1rem" }}>
                          <span className="text-purple-300/70">UTC:</span>
                          <span className="text-purple-200">
                            {new Date().toLocaleTimeString([], { hour12: false })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Main Input Area */}
                    <div
                      className="flex-1 flex items-center justify-center relative"
                      style={{ padding: size.width < 400 ? "1rem" : size.width < 500 ? "1.5rem" : "2rem" }}
                    >
                      {/* Thinking Backdrop Effect */}
                      {isLoading && (
                        <div className="absolute inset-0 bg-gradient-to-br from-retro-green/5 via-retro-cyan/5 to-retro-blue/5 animate-pulse">
                          <div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-retro-green/10 to-transparent animate-pulse"
                            style={{ animationDelay: "0.5s" }}
                          />
                        </div>
                      )}

                      <div className="text-center relative z-10">
                        <div className="text-lg font-mono text-purple-200/80 mb-2">
                          {isLoading ? "PROCESSING..." : "READY FOR INPUT"}
                        </div>
                        <div className="text-xs font-mono text-purple-300/50">
                          {isLoading ? "Analyzing request..." : "Type your query below"}
                        </div>

                        {/* Thinking Animation */}
                        {isLoading && (
                          <div className="flex justify-center mt-4 space-x-2">
                            {[0, 1, 2, 3, 4].map((i) => (
                              <motion.div
                                key={i}
                                className="w-1 h-8 bg-gradient-to-t from-retro-green to-retro-cyan rounded-full"
                                animate={{
                                  scaleY: [0.3, 1, 0.3],
                                  opacity: [0.3, 1, 0.3],
                                }}
                                transition={{
                                  duration: 1.2,
                                  repeat: Number.POSITIVE_INFINITY,
                                  delay: i * 0.1,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer - Enhanced Input */}
                    <div
                      className="
    relative z-10
    border-t border-purple-500/20
    bg-gradient-to-r from-purple-900/20 via-gray-900/40 to-violet-900/20
    backdrop-blur-sm
  "
                      style={{ padding: size.width < 400 ? "0.75rem" : size.width < 500 ? "1rem" : "1.5rem" }}
                    >
                      <div className="space-y-2">
                        {/* Input Header */}
                        <div
                          className="flex items-center justify-between font-mono"
                          style={{ fontSize: size.width < 400 ? "0.625rem" : "0.75rem" }}
                        >
                          <span className="text-purple-300/70">INPUT:</span>
                          <span className="text-purple-300/50">{inputValue.length}/1000</span>
                        </div>

                        <div className="flex items-end" style={{ gap: size.width < 400 ? "0.5rem" : "0.75rem" }}>
                          <div className="flex-1 relative group">
                            <textarea
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSend()
                                }
                              }}
                              placeholder={isLoading ? "Processing..." : "Enter your query..."}
                              disabled={isLoading}
                              rows={size.height < 500 ? 2 : size.height < 600 ? 3 : 4}
                              maxLength={1000}
                              style={{
                                fontSize: size.width < 400 ? "0.625rem" : "0.875rem",
                                padding: size.width < 400 ? "0.5rem" : "0.75rem 1rem",
                              }}
                              className="
            w-full
            bg-gray-800/60
            backdrop-blur-sm
            border border-retro-green/30
            rounded-2xl
            placeholder-retro-green/50
            text-retro-green-50
            focus:outline-none focus:ring-2 focus:ring-retro-green/50 focus:border-retro-green/50
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-300
            font-mono
            resize-none
            group-hover:border-retro-green/50
          "
                            />

                            {/* RGB Hover Glow */}
                            <div className="absolute inset-0 bg-gradient-to-r from-retro-green/0 via-retro-cyan/0 to-retro-blue/0 group-hover:from-retro-green/5 group-hover:via-retro-cyan/5 group-hover:to-retro-blue/5 rounded-2xl pointer-events-none transition-all duration-500" />
                          </div>

                          <button
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isLoading}
                            style={{
                              width: size.width < 400 ? "2.5rem" : "3rem",
                              height: size.width < 400 ? "2.5rem" : "3rem",
                            }}
                            className="
          rounded-2xl
          bg-gradient-to-br from-retro-green to-retro-cyan
          hover:from-retro-green/80 hover:to-retro-cyan/80
          disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center
          transition-all duration-300
          focus:outline-none focus:ring-2 focus:ring-retro-green/50
          shadow-lg shadow-retro-green/25
          hover:shadow-xl hover:shadow-retro-green/40
          hover:scale-105
          relative
          overflow-hidden
          group
          flex-shrink-0
        "
                            aria-label="Execute"
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                            <div className="absolute inset-0 bg-gradient-to-r from-retro-green/0 via-retro-cyan/0 to-retro-blue/0 group-hover:from-retro-green/20 group-hover:via-retro-cyan/20 group-hover:to-retro-blue/20 transition-all duration-500" />
                            <span
                              className="font-mono font-bold text-white relative z-10"
                              style={{ fontSize: size.width < 400 ? "0.625rem" : "0.75rem" }}
                            >
                              {isLoading ? "..." : "RUN"}
                            </span>
                          </button>
                        </div>

                        {/* Command Line Style Footer */}
                        <div
                          className="flex items-center justify-between font-mono text-purple-300/50"
                          style={{ fontSize: size.width < 400 ? "0.5rem" : "0.75rem" }}
                        >
                          <span>{size.width < 400 ? "CTRL+↵" : "CTRL+ENTER to execute"}</span>
                          <span>ESC to close</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Demo Controls */}
      <div className="fixed bottom-4 left-4 z-40 flex gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="
            px-4 py-2 
            bg-gray-900/80
            backdrop-blur-glass
            border border-purple-500/30
            rounded-xl text-sm font-medium font-mono
            text-purple-200
            hover:bg-gray-800/80 hover:border-purple-400/50
            transition-all duration-300
            shadow-lg shadow-purple-500/10
          "
        >
          {isOpen ? "HIDE ALLY" : "SHOW ALLY"}
        </button>

        {isOpen && (
          <button
            onClick={toggleDock}
            className="
              px-4 py-2 
              bg-gray-900/80
              backdrop-blur-glass
              border border-purple-500/30
              rounded-xl text-sm font-medium font-mono
              text-purple-200
              hover:bg-gray-800/80 hover:border-purple-400/50
              transition-all duration-300
              shadow-lg shadow-purple-500/10
            "
          >
            {isDocked ? "Undock" : "Dock"}
          </button>
        )}
      </div>
    </>
  )
}
