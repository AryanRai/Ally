'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface StreamingTextProps {
  content: string
  isStreaming: boolean
  isComplete: boolean
  className?: string
  streamingSpeed?: number // milliseconds between words
}

export function StreamingText({ 
  content, 
  isStreaming, 
  isComplete, 
  className = '',
  streamingSpeed = 50 
}: StreamingTextProps) {
  const [displayedContent, setDisplayedContent] = useState('')
  const [showCursor, setShowCursor] = useState(false)
  const previousContentRef = useRef('')
  const streamingTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    // Clear any existing timeout
    if (streamingTimeoutRef.current) {
      clearTimeout(streamingTimeoutRef.current)
    }

    if (!content) {
      setDisplayedContent('')
      setShowCursor(false)
      return
    }

    if (isComplete && !isStreaming) {
      // Show final content immediately when complete
      setDisplayedContent(content)
      setShowCursor(false)
      return
    }

    if (isStreaming) {
      setShowCursor(true)
      
      // Check if we have new content to stream
      if (content !== previousContentRef.current) {
        const previousLength = previousContentRef.current.length
        const newContent = content.slice(previousLength)
        
        if (newContent) {
          // Stream the new content word by word
          const words = newContent.split(' ')
          let wordIndex = 0
          
          const streamWords = () => {
            if (wordIndex < words.length) {
              const word = words[wordIndex]
              const separator = wordIndex === 0 ? '' : ' '
              
              setDisplayedContent(prev => prev + separator + word)
              wordIndex++
              
              streamingTimeoutRef.current = setTimeout(streamWords, streamingSpeed)
            }
          }
          
          streamWords()
        }
        
        previousContentRef.current = content
      }
    }

    return () => {
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current)
      }
    }
  }, [content, isStreaming, isComplete, streamingSpeed])

  // Handle cursor blinking
  useEffect(() => {
    if (!showCursor) return

    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 500)

    return () => clearInterval(cursorInterval)
  }, [showCursor])

  return (
    <div className={className}>
      <span className="whitespace-pre-wrap">
        {displayedContent}
      </span>
      {isStreaming && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: showCursor ? 1 : 0.3 }}
          transition={{ duration: 0.1 }}
          className="inline-block w-2 h-5 bg-blue-400 ml-1"
        />
      )}
    </div>
  )
}