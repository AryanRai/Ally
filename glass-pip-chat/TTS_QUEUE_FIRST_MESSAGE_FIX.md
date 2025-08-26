# TTS Queue First Message Fix

## Issue
When creating a new chat and sending the first message, the TTS streaming queue system doesn't work properly - the first message's TTS doesn't play. However, subsequent messages work fine.

## Root Cause Analysis
The issue was caused by stale TTS streaming state from previous conversations. When a new chat is created, the TTS streaming system retained state from the previous session:

1. **Stale Stream References**: `currentStreamIdRef.current` might still contain a message ID from a previous conversation
2. **Queue State Confusion**: The streaming system would think it's still processing a previous stream and queue the new message instead of playing it immediately
3. **No Proper Reset**: There was no cleanup when creating new chats or switching between chats

## Solution Implemented

### 1. **Proper TTS Queue Reset on New Chat**
Added automatic TTS queue reset when creating new chats:

```typescript
const handleChatCreate = () => {
  // Clear TTS queue when creating new chat to prevent issues with first message
  console.log('🆕 Creating new chat - resetting TTS queue');
  speechService.resetTTSQueue();
  
  chatManager.createNewChat();
  refreshChatState();
};
```

### 2. **TTS Queue Reset on Chat Switch**
Added automatic TTS queue reset when switching between chats:

```typescript
const handleChatSelect = (chatId: string) => {
  // Clear TTS queue when switching chats to prevent cross-chat audio issues
  console.log('🔄 Switching chat - resetting TTS queue');
  speechService.resetTTSQueue();
  
  chatManager.switchToChat(chatId);
  refreshChatState();
};
```

### 3. **Improved Stale Stream Detection**
Enhanced the TTS stream start handler to detect and clear stale streams:

```typescript
window.pip.speech.onTTSStreamStart((data: any) => {
  console.log('🎵 TTS streaming started:', data.message_id);
  const messageId = data.message_id || 'default';
  
  // Check if we have a stale current stream that's not actually playing
  const hasStaleStream = currentStreamIdRef.current && 
                        !isPlayingRef.current && 
                        audioQueueRef.current.length === 0;
  
  // If this is a new stream and we're not currently playing, or we have a stale stream, start it
  if (!currentStreamIdRef.current || hasStaleStream) {
    if (hasStaleStream) {
      console.log('🧹 Clearing stale TTS stream:', currentStreamIdRef.current);
    }
    currentStreamIdRef.current = messageId;
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    console.log('🎯 Starting new TTS stream:', messageId);
  } else {
    // Queue this stream for later
    pendingChunksRef.current.set(messageId, []);
    console.log('📝 Queuing TTS stream:', messageId, '(current stream:', currentStreamIdRef.current, ')');
  }
});
```

### 4. **Enhanced stopCurrentSpeech Function**
Improved the speech stopping function with better logging and state cleanup:

```typescript
const stopCurrentSpeech = useCallback(() => {
  console.log('🔇 Stopping current speech and clearing all queues');
  
  // Stop current audio playback
  if (currentAudioSourceRef.current) {
    try {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
      console.log('🛑 Stopped current audio source');
    } catch (error) {
      console.error('Error stopping current audio:', error);
    }
  }

  // Clear all queues and reset state
  const hadPendingStreams = pendingChunksRef.current.size > 0;
  const hadQueuedAudio = audioQueueRef.current.length > 0;
  const hadCurrentStream = currentStreamIdRef.current !== null;
  
  audioQueueRef.current = [];
  pendingChunksRef.current.clear();
  currentStreamIdRef.current = null;
  isPlayingRef.current = false;

  // Also tell the speech service to clear its queue
  if (window.pip?.speech) {
    window.pip.speech.clearTTSQueue?.();
  }

  console.log('🧹 Speech state cleared:', {
    hadCurrentStream,
    hadQueuedAudio,
    hadPendingStreams: hadPendingStreams
  });
}, []);
```

### 5. **Added resetTTSQueue Function**
Created a dedicated function for resetting the TTS queue:

```typescript
const resetTTSQueue = useCallback(() => {
  console.log('🔄 Resetting TTS queue for new conversation');
  stopCurrentSpeech();
}, [stopCurrentSpeech]);
```

### 6. **Enhanced Debugging**
Added comprehensive logging to help debug TTS streaming issues:

```typescript
const synthesizeSpeechStreaming = useCallback(async (text: string) => {
  console.log('🎤 Requesting streaming TTS for:', text.substring(0, 50) + '...', {
    currentStream: currentStreamIdRef.current,
    isPlaying: isPlayingRef.current,
    queueLength: audioQueueRef.current.length,
    pendingStreams: pendingChunksRef.current.size
  });
  
  const result = await window.pip.speech.synthesizeStreaming(text);
  if (!result.success) {
    throw new Error(result.error || 'Failed to synthesize streaming speech');
  }
}, []);
```

## How It Works Now

### New Chat Creation:
1. **User clicks "New Chat"** → `handleChatCreate()` is called
2. **TTS Queue Reset** → `speechService.resetTTSQueue()` clears all streaming state
3. **Chat Created** → New chat is created with clean TTS state
4. **First Message** → TTS streaming works properly from the start

### Chat Switching:
1. **User selects different chat** → `handleChatSelect()` is called
2. **TTS Queue Reset** → Prevents audio from previous chat bleeding into new chat
3. **Chat Switched** → Clean TTS state for the selected chat

### TTS Stream Processing:
1. **Stream Start** → Detects and clears any stale streams
2. **Chunk Processing** → Properly queues or plays audio chunks
3. **Stream Complete** → Cleanly transitions to next pending stream

## Testing the Fix

### Test Steps:
1. **Create a new chat** (click + button or Ctrl+Shift+N)
2. **Send a message** with voice mode enabled
3. **Verify TTS plays immediately** for the first message
4. **Send another message** and verify TTS still works
5. **Create another new chat** and repeat

### Expected Behavior:
- ✅ First message TTS plays immediately in new chats
- ✅ Subsequent messages continue to work
- ✅ No audio bleeding between different chats
- ✅ Clean TTS queue state for each conversation

### Debug Information:
Check browser console for logs like:
- `🆕 Creating new chat - resetting TTS queue`
- `🔄 Resetting TTS queue for new conversation`
- `🧹 Speech state cleared`
- `🎯 Starting new TTS stream: [message_id]`

## Files Modified

- `src/components/GlassChatPiP.tsx`: Added TTS queue reset on chat creation/switching
- `src/hooks/useSpeechService.ts`: Enhanced TTS streaming state management and debugging

## Benefits

1. **Consistent TTS Behavior**: First message TTS works reliably in new chats
2. **Clean State Management**: No stale streaming state between conversations
3. **Better Debugging**: Comprehensive logging for troubleshooting
4. **Improved User Experience**: Seamless TTS functionality from the first message
5. **Prevents Audio Bleeding**: Clean separation between different chats