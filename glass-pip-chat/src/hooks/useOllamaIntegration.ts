import { useState, useEffect, useCallback } from 'react';
import { Message } from '../types/chat';

export function useOllamaIntegration() {
  const [ollamaAvailable, setOllamaAvailable] = useState(false);
  const [currentModel, setCurrentModelState] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Wrapper to persist model selection
  const setCurrentModel = useCallback(async (model: string) => {
    console.log('🎯 Setting current model:', model);
    setCurrentModelState(model);
    
    // Save to localStorage so remote poller can include it in heartbeat
    try { localStorage.setItem('ally-current-model', model); } catch {}
    
    // Persist the selection to config
    try {
      if (window.pip?.ollama) {
        const config = await window.pip.ollama.getConfig();
        
        // Determine provider based on model name
        const isOpenRouterModel = model.includes('/'); // OpenRouter models have provider/model format
        const isGeminiModel = model.startsWith('gemini-'); // Direct Gemini models
        
        let provider: 'ollama' | 'openrouter' | 'gemini' = 'ollama';
        if (isGeminiModel) {
          provider = 'gemini';
        } else if (isOpenRouterModel) {
          provider = 'openrouter';
        }
        
        await window.pip.ollama.updateConfig({
          ...config,
          preferredProvider: provider,
          openRouterDefaultModel: isOpenRouterModel ? model : config.openRouterDefaultModel,
          geminiDefaultModel: isGeminiModel ? model : config.geminiDefaultModel,
          ollamaDefaultModel: (!isOpenRouterModel && !isGeminiModel) ? model : config.ollamaDefaultModel,
        });
        
        await window.pip.ollama.setProvider(provider);
        console.log('✅ Model selection persisted:', model, 'Provider:', provider);
      }
    } catch (error) {
      console.error('Failed to persist model selection:', error);
    }
  }, []);

  // Initialize both Ollama and OpenRouter
  useEffect(() => {
    if (!window.pip?.ollama) return;

    const initServices = async () => {
      try {
        console.log('🔄 Initializing AI services...');
        
        // Load saved config first
        const savedConfig = await window.pip.ollama.getConfig();
        console.log('📂 Loaded saved config:', savedConfig);
        
        // Check Ollama availability
        const ollamaAvailable = await window.pip.ollama.isAvailable();
        console.log('Ollama available:', ollamaAvailable);
        setOllamaAvailable(ollamaAvailable);

        // Load all available models from both providers
        const allModels = await window.pip.ollama.getModels();
        console.log('All available models:', allModels);
        setAvailableModels(allModels);

        // Use saved model from config if available
        let selectedModel = '';
        
        if (savedConfig?.preferredProvider === 'gemini' && savedConfig?.geminiDefaultModel) {
          selectedModel = savedConfig.geminiDefaultModel;
          console.log('📂 Using saved Gemini model:', selectedModel);
        } else if (savedConfig?.preferredProvider === 'openrouter' && savedConfig?.openRouterDefaultModel) {
          selectedModel = savedConfig.openRouterDefaultModel;
          console.log('📂 Using saved OpenRouter model:', selectedModel);
        } else if (savedConfig?.ollamaDefaultModel) {
          selectedModel = savedConfig.ollamaDefaultModel;
          console.log('📂 Using saved Ollama model:', selectedModel);
        }
        
        // Fallback to finding a default if no saved model
        if (!selectedModel && allModels.length > 0) {
          let defaultModel = allModels.find((m: any) => 
            m.name?.includes('llama') || m.id?.includes('llama')
          );
          
          if (!defaultModel) {
            defaultModel = allModels.find((m: any) => 
              m.name?.includes('claude') || m.id?.includes('claude')
            );
          }
          
          if (!defaultModel) {
            defaultModel = allModels[0];
          }
          
          selectedModel = defaultModel.name || defaultModel.id;
          console.log('🔍 Selected fallback model:', selectedModel);
        }
        
        if (selectedModel) {
          setCurrentModelState(selectedModel);
          try { localStorage.setItem('ally-current-model', selectedModel); } catch {}
          console.log('✅ Current model set to:', selectedModel);
        }
      } catch (error) {
        console.error('Failed to initialize AI services:', error);
        setOllamaAvailable(false);
        setAvailableModels([]);
        setCurrentModelState('');
      }
    };

    initServices();
  }, []);

  const sendMessageToOllama = async (
    messages: Message[],
    messageContent: string,
    onStreamUpdate: (chunk: any) => void
  ): Promise<string> => {
    if (!ollamaAvailable || !window.pip?.ollama || !currentModel) {
      throw new Error('Ollama not available');
    }

    console.log('🚀 Sending message with model:', currentModel);

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

    try {
      // Use the enhanced streaming method with real-time updates
      await window.pip.ollama.streamChatWithThinking(chatHistory, currentModel, (chunk: any) => {
        console.log('Received chunk:', chunk);
        
        if (chunk.type === 'thinking') {
          thinkingContent = chunk.content;
          onStreamUpdate({
            type: 'thinking',
            thinking: thinkingContent,
            response: responseContent
          });
        } else if (chunk.type === 'response') {
          responseContent = chunk.content;
          onStreamUpdate({
            type: 'response',
            thinking: thinkingContent,
            response: responseContent
          });
        } else if (chunk.type === 'done') {
          fullResponse = chunk.content;
          onStreamUpdate({
            type: 'done',
            thinking: thinkingContent,
            response: responseContent || fullResponse
          });
        }
      });
    } catch (error: any) {
      if (error.message?.includes('aborted') || error.name === 'AbortError') {
        onStreamUpdate({
          type: 'done',
          thinking: thinkingContent,
          response: responseContent || 'Stopped by user'
        });
        return responseContent || 'Stopped by user';
      }
      throw error;
    }

    fullResponse = responseContent || fullResponse;
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
