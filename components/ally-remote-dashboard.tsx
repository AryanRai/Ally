'use client';

import { useState, useEffect } from 'react';
import { allySocketManager } from '@/lib/ally-socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Circle, Bot, User, Wifi, WifiOff, Server } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AllyInstance {
  token: string;
  allyId: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: string;
}

interface Message {
  id: string;
  token: string;
  type: 'command' | 'response';
  content: string;
  timestamp: Date;
}

export default function AllyRemoteDashboard() {
  const [instances, setInstances] = useState<AllyInstance[]>([]);
  const [selectedAlly, setSelectedAlly] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = allySocketManager.connect();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    allySocketManager.onAllyInstances((instances) => {
      setInstances(instances);
    });

    allySocketManager.onAllyStatus((data) => {
      setInstances(prev => prev.map(instance => 
        instance.token === data.token 
          ? { ...instance, status: data.status }
          : instance
      ));
    });

    allySocketManager.onAllyResponse((data) => {
      const newMessage: Message = {
        id: Date.now().toString(),
        token: data.token,
        type: 'response',
        content: data.response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newMessage]);
    });

    return () => {
      allySocketManager.disconnect();
    };
  }, []);

  const sendCommand = () => {
    if (!selectedAlly || !command.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      token: selectedAlly,
      type: 'command',
      content: command,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    allySocketManager.sendCommand(selectedAlly, 'chat', { message: command });
    setCommand('');
  };

  const selectedInstance = instances.find(i => i.token === selectedAlly);
  const selectedMessages = messages.filter(m => m.token === selectedAlly);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Ally Remote Control
              </h1>
              <p className="text-muted-foreground mt-2">
                Monitor and control your AI assistants remotely
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border">
                {connected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-400">Disconnected</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Ally Instances Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-5 h-5" />
                  Connected Allies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {instances.length === 0 ? (
                    <div className="text-center py-8">
                      <Bot className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">No Ally instances connected</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Start your Glass PiP Chat to see it here
                      </p>
                    </div>
                  ) : (
                    instances.map((instance) => (
                      <motion.div
                        key={instance.token}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                          selectedAlly === instance.token 
                            ? 'bg-primary/10 border-primary shadow-md' 
                            : 'hover:bg-muted/50 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedAlly(instance.token)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                              {instance.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{instance.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{instance.allyId}</p>
                          </div>
                          <Badge 
                            variant={instance.status === 'online' ? 'default' : 'secondary'}
                            className={instance.status === 'online' ? 'bg-green-500' : ''}
                          >
                            {instance.status}
                          </Badge>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Chat Interface */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-3"
          >
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {selectedInstance ? (
                    <>
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
                          {selectedInstance.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      Chat with {selectedInstance.name}
                    </>
                  ) : (
                    <>
                      <Bot className="w-6 h-6" />
                      Select an Ally to start chatting
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {selectedInstance ? (
                  <div className="flex flex-col h-full">
                    {/* Messages */}
                    <ScrollArea className="flex-1 pr-4">
                      <div className="space-y-4">
                        <AnimatePresence>
                          {selectedMessages.length === 0 ? (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-center py-12"
                            >
                              <Bot className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
                              <p className="text-muted-foreground">No messages yet. Start a conversation!</p>
                            </motion.div>
                          ) : (
                            selectedMessages.map((message, index) => (
                              <motion.div
                                key={message.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className={`flex ${message.type === 'command' ? 'justify-end' : 'justify-start'}`}
                              >
                                <div className={`flex items-start gap-3 max-w-[80%] ${message.type === 'command' ? 'flex-row-reverse' : ''}`}>
                                  <Avatar className="w-8 h-8 mt-1">
                                    <AvatarFallback className={message.type === 'command' 
                                      ? 'bg-blue-500 text-white' 
                                      : 'bg-purple-500 text-white'
                                    }>
                                      {message.type === 'command' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div
                                    className={`p-4 rounded-2xl ${
                                      message.type === 'command'
                                        ? 'bg-blue-500 text-white rounded-br-md'
                                        : 'bg-muted rounded-bl-md'
                                    }`}
                                  >
                                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                    <p className={`text-xs mt-2 ${
                                      message.type === 'command' ? 'text-blue-100' : 'text-muted-foreground'
                                    }`}>
                                      {message.timestamp.toLocaleTimeString()}
                                    </p>
                                  </div>
                                </div>
                              </motion.div>
                            ))
                          )}
                        </AnimatePresence>
                      </div>
                    </ScrollArea>

                    <Separator className="my-4" />

                    {/* Input */}
                    <div className="flex gap-3">
                      <Input
                        placeholder="Type a message to send to your Ally..."
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendCommand()}
                        disabled={selectedInstance.status !== 'online'}
                        className="flex-1"
                      />
                      <Button 
                        onClick={sendCommand}
                        disabled={!command.trim() || selectedInstance.status !== 'online'}
                        size="icon"
                        className="shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>

                    {selectedInstance.status !== 'online' && (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-sm text-muted-foreground text-center mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                      >
                        ⚠️ Ally is offline. Messages will be queued until reconnection.
                      </motion.p>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Bot className="w-24 h-24 mx-auto text-muted-foreground/20 mb-6" />
                      <h3 className="text-lg font-medium text-muted-foreground mb-2">
                        Select an Ally instance
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Choose an Ally from the sidebar to start remote control
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}