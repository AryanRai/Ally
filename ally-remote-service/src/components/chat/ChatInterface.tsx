'use client';

import { useState, useEffect, useRef } from 'react';
import { useMessages } from '@/hooks/useMessages';
import { ChatSidebar } from './ChatSidebar';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function ChatInterface() {
  const {
    messages,
    sessions,
    currentSession,
    loading,
    error,
    sendMessage,
    createSession,
    deleteSession,
    setCurrentSession,
  } = useMessages();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    try {
      setIsTyping(true);
      
      let sessionId = currentSession?.id;
      
      // Create new session if none exists
      if (!sessionId) {
        const newSession = await createSession(
          content.length > 50 ? content.substring(0, 50) + '...' : content
        );
        sessionId = newSession.id;
      }

      await sendMessage(content, sessionId);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const session = await createSession('New Chat');
      setCurrentSession(session);
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-r bg-white/50 dark:bg-black/50 backdrop-blur-sm overflow-hidden"
          >
            <ChatSidebar
              sessions={sessions}
              currentSession={currentSession}
              onSessionSelect={setCurrentSession}
              onSessionDelete={deleteSession}
              onNewChat={handleNewChat}
              loading={loading}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b bg-white/50 dark:bg-black/50 backdrop-blur-sm p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="w-4 h-4" />
                ) : (
                  <PanelLeftOpen className="w-4 h-4" />
                )}
              </Button>
              
              <div>
                <h2 className="font-semibold">
                  {currentSession?.title || 'Select a chat or start a new one'}
                </h2>
                {currentSession && (
                  <p className="text-sm text-muted-foreground">
                    {messages.length} messages
                  </p>
                )}
              </div>
            </div>

            {!currentSession && (
              <Button onClick={handleNewChat} disabled={loading}>
                New Chat
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          {currentSession ? (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <MessageList
                  messages={messages}
                  loading={loading}
                  isTyping={isTyping}
                />
                <div ref={messagesEndRef} />
              </div>
              
              <div className="border-t bg-white/50 dark:bg-black/50 backdrop-blur-sm p-4">
                <MessageInput
                  onSendMessage={handleSendMessage}
                  disabled={loading || isTyping}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="mb-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">A</span>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">
                    Welcome to Ally Remote
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    Start a conversation with your AI assistant. Your local Ally system will process your messages and respond in real-time.
                  </p>
                </div>
                
                <Button onClick={handleNewChat} disabled={loading}>
                  {loading ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Loading...
                    </>
                  ) : (
                    'Start New Chat'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}