'use client';

import { useState, useEffect } from 'react';
import { socketManager } from '@/lib/socket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Circle } from 'lucide-react';

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

export default function AllyDashboard() {
  const [instances, setInstances] = useState<AllyInstance[]>([]);
  const [selectedAlly, setSelectedAlly] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [command, setCommand] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = socketManager.connect();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socketManager.onAllyInstances((instances) => {
      setInstances(instances);
    });

    socketManager.onAllyStatus((data) => {
      setInstances(prev => prev.map(instance => 
        instance.token === data.token 
          ? { ...instance, status: data.status }
          : instance
      ));
    });

    socketManager.onAllyResponse((data) => {
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
      socketManager.disconnect();
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
    socketManager.sendCommand(selectedAlly, 'chat', { message: command });
    setCommand('');
  };

  const selectedInstance = instances.find(i => i.token === selectedAlly);
  const selectedMessages = messages.filter(m => m.token === selectedAlly);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Ally Remote Dashboard</h1>
        <div className="flex items-center gap-2 mt-2">
          <Circle className={`w-3 h-3 ${connected ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'}`} />
          <span className="text-sm text-muted-foreground">
            {connected ? 'Connected to server' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ally Instances */}
        <Card>
          <CardHeader>
            <CardTitle>Connected Allies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {instances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Ally instances connected</p>
              ) : (
                instances.map((instance) => (
                  <div
                    key={instance.token}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedAlly === instance.token 
                        ? 'bg-primary/10 border-primary' 
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setSelectedAlly(instance.token)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{instance.name}</p>
                        <p className="text-xs text-muted-foreground">{instance.allyId}</p>
                      </div>
                      <Badge variant={instance.status === 'online' ? 'default' : 'secondary'}>
                        {instance.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat Interface */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {selectedInstance ? `Chat with ${selectedInstance.name}` : 'Select an Ally'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedInstance ? (
              <div className="space-y-4">
                <ScrollArea className="h-96 w-full border rounded-lg p-4">
                  <div className="space-y-3">
                    {selectedMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No messages yet. Start a conversation!</p>
                    ) : (
                      selectedMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.type === 'command' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] p-3 rounded-lg ${
                              message.type === 'command'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <p className="text-sm">{message.content}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {message.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>

                <div className="flex gap-2">
                  <Input
                    placeholder="Type a command or message..."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendCommand()}
                    disabled={selectedInstance.status !== 'online'}
                  />
                  <Button 
                    onClick={sendCommand}
                    disabled={!command.trim() || selectedInstance.status !== 'online'}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>

                {selectedInstance.status !== 'online' && (
                  <p className="text-sm text-muted-foreground text-center">
                    Ally is offline. Commands will be queued until reconnection.
                  </p>
                )}
              </div>
            ) : (
              <div className="h-96 flex items-center justify-center text-muted-foreground">
                Select an Ally instance to start chatting
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}