'use client'

import { MessageBubble } from './MessageBubble'
import type { Message } from '@/types'

interface MessageListProps {
  messages: Message[]
  streamingMessages?: Map<string, string>
}

export function MessageList({ messages, streamingMessages }: MessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageBubble 
          key={message.id} 
          message={message} 
          streamingContent={streamingMessages?.get(message.id)}
        />
      ))}
    </div>
  )
}