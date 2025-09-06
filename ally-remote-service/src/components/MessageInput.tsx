'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Mic, MicOff } from 'lucide-react'

interface MessageInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function MessageInput({ onSend, disabled = false, placeholder = "Type your message..." }: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSend(message.trim())
      setMessage('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [message])

  const handleVoiceToggle = () => {
    // Voice recording functionality will be implemented in a future task
    setIsRecording(!isRecording)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end space-x-3">
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent text-white placeholder-gray-400 border-0 outline-none resize-none max-h-32 py-3 px-4 glass rounded-xl border border-white/10 focus:border-blue-500/50 focus:glow transition-all duration-200"
        />
        
        {/* Character count for long messages */}
        {message.length > 100 && (
          <div className="absolute bottom-1 right-2 text-xs text-gray-500">
            {message.length}/1000
          </div>
        )}
      </div>

      {/* Voice recording button */}
      <button
        type="button"
        onClick={handleVoiceToggle}
        disabled={disabled}
        className={`p-3 rounded-xl glass border transition-all duration-200 ${
          isRecording
            ? 'bg-red-500/20 border-red-500/50 text-red-400'
            : 'border-white/10 text-gray-400 hover:text-white hover:border-blue-500/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:glow'}`}
      >
        {isRecording ? (
          <MicOff className="w-5 h-5" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>

      {/* Send button */}
      <button
        type="submit"
        disabled={!message.trim() || disabled}
        className={`p-3 rounded-xl glass border transition-all duration-200 ${
          message.trim() && !disabled
            ? 'bg-blue-500/20 border-blue-500/50 text-blue-400 hover:bg-blue-500/30 hover:glow'
            : 'border-white/10 text-gray-500 cursor-not-allowed'
        }`}
      >
        <Send className="w-5 h-5" />
      </button>
    </form>
  )
}