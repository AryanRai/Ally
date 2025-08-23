'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  HelpCircle, 
  Server, 
  Download, 
  Play, 
  CheckCircle, 
  ExternalLink,
  Copy,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SetupGuideProps {
  onClose?: () => void;
}

export default function SetupGuide({ onClose }: SetupGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToClipboard = async (text: string, stepIndex: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepIndex);
      setTimeout(() => setCopiedStep(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const steps = [
    {
      title: "Set up Digital Ocean Server",
      description: "Deploy the middleware server on your Digital Ocean droplet",
      commands: [
        "git clone <your-repo-url>",
        "cd ally-remote-system/middleware-server",
        "chmod +x deploy.sh && ./deploy.sh"
      ],
      badge: "Server"
    },
    {
      title: "Configure Glass PiP Chat",
      description: "Enable remote control in your desktop application",
      commands: [
        "cd glass-pip-chat",
        "node configure-remote.js YOUR_DROPLET_IP",
        "npm install && npm run dev"
      ],
      badge: "Desktop"
    },
    {
      title: "Connect Web Dashboard",
      description: "Configure this web dashboard to connect to your server",
      commands: [
        "Click 'Server Config' button above",
        "Enter: http://YOUR_DROPLET_IP:3001",
        "Click 'Connect'"
      ],
      badge: "Web"
    }
  ];

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  return (
    <>
      {/* Help Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2"
      >
        <HelpCircle className="w-4 h-4" />
        Setup Guide
      </Button>

      {/* Setup Guide Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={handleClose}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-4 md:inset-8 lg:inset-16 z-50 overflow-auto"
            >
              <Card className="max-w-4xl mx-auto shadow-2xl">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl flex items-center gap-3">
                      <Server className="w-6 h-6 text-blue-500" />
                      Ally Remote Control Setup Guide
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClose}
                      className="h-8 w-8 p-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    Follow these steps to set up remote control for your AI assistant
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {steps.map((step, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="border rounded-lg p-6"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                              {index + 1}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold">{step.title}</h3>
                              <Badge variant="secondary">{step.badge}</Badge>
                            </div>
                            <p className="text-muted-foreground mb-4">{step.description}</p>
                            
                            <div className="space-y-2">
                              {step.commands.map((command, cmdIndex) => (
                                <div
                                  key={cmdIndex}
                                  className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg font-mono text-sm"
                                >
                                  <code className="flex-1">{command}</code>
                                  {command.startsWith('git') || command.startsWith('cd') || command.startsWith('node') || command.startsWith('npm') ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(command, index * 10 + cmdIndex)}
                                      className="h-6 w-6 p-0"
                                    >
                                      {copiedStep === index * 10 + cmdIndex ? (
                                        <CheckCircle className="w-3 h-3 text-green-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {/* Additional Resources */}
                    <div className="border-t pt-6">
                      <h3 className="text-lg font-semibold mb-4">Additional Resources</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <Card className="p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <Download className="w-5 h-5 text-blue-500" />
                            <h4 className="font-medium">Digital Ocean Setup</h4>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Detailed server deployment instructions
                          </p>
                          <Button variant="outline" size="sm" className="w-full">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View Documentation
                          </Button>
                        </Card>

                        <Card className="p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <Play className="w-5 h-5 text-green-500" />
                            <h4 className="font-medium">Glass PiP Chat</h4>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Desktop application setup guide
                          </p>
                          <Button variant="outline" size="sm" className="w-full">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Open README
                          </Button>
                        </Card>
                      </div>
                    </div>

                    {/* Quick Tips */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">💡 Quick Tips</h4>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                        <li>• Make sure port 3001 is open on your Digital Ocean droplet</li>
                        <li>• Use your droplet's public IP address, not localhost</li>
                        <li>• Test the connection before starting your Glass PiP Chat</li>
                        <li>• Check the browser console for connection errors</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}