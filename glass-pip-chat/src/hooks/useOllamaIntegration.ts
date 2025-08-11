import { useState, useEffect } from 'react';
import { Message } from '../types/chat';

export function useOllamaIntegration() {
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Ollama initialization
  useEffect(() => {
    if (!window.pip?.ollama) return;

    const initOllama = async () => {
      try {
        console.log('Checking Ollama availability...');
        const available = await window.pip.ollama.isAvailable();
        console.log('Ollama available:', available);
        setOllamaAvailable(available);

        if (available) {
          console.log('Loading Ollama models...');
          const models = await window.pip.ollama.getModels();
          console.log('Available models:', models);
          setAvailableModels(models);

          if (models.length > 0) {
            const defaultModel = models.find((m: any) => m.name.includes('llama')) || models[0];
            setCurrentModel(defaultModel.name);
            console.log('Selected default model:', defaultModel.name);
          }
        } else {
          setAvailableModels([]);
          setCurrentModel('');
        }
      } catch (error) {
        console.error('Failed to initialize Ollama:', error);
        setOllamaAvailable(false);
        setAvailableModels([]);
        setCurrentModel('');
      }
    };

    initOllama();
  }, []);

  const sendMessageToOllama = async (
    messages: Message[],
    messageContent: string,
    onStreamUpdate: (chunk: any) => void
  ): Promise<string> => {
    if (!ollamaAvailable || !window.pip?.ollama || !currentModel) {
      throw new Error('Ollama not available');
    }

    console.log('Sending message to Ollama with model:', currentModel);

    // Convert our messages to Ollama format
    const chatHistory = messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }));

    // Add current message
    chatHistory.push({
      role: 'user',
      content: messageContent
    });

    console.log('Chat history:', chatHistory);

    let fullResponse = '';
    let thinkingContent = '';
    let responseContent = '';

    // Use the enhanced streaming method
    await window.pip.ollama.streamChatWithThinking(chatHistory, currentModel, (chunk: any) => {
      if (chunk.type === 'thinking') {
        thinkingContent += chunk.content;
        onStreamUpdate({
          type: 'thinking',
          thinking: thinkingContent,
          response: responseContent
        });
      } else if (chunk.type === 'response') {
        responseContent += chunk.content;
        onStreamUpdate({
          type: 'response',
          thinking: thinkingContent,
          response: responseContent
        });
      } else if (chunk.type === 'done') {
        onStreamUpdate({
          type: 'done',
          thinking: thinkingContent,
          response: responseContent
        });
      }
    });

    fullResponse = responseContent;
    console.log('Ollama response with thinking:', { thinking: thinkingContent, response: responseContent });

    return fullResponse;
  };

  const getUnavailableReason = () => {
    if (!ollamaAvailable) return "Ollama is not running";
    if (!currentModel) return "No model selected";
    return "Ollama API not available";
  };

  return {
    ollamaAvailable,
    currentModel,
    setCurrentModel,
    availableModels,
    showModelSelector,
    setShowModelSelector,
    sendMessageToOllama,
    getUnavailableReason
  };
}