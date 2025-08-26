#!/usr/bin/env python3
"""
Ally Speech Service - WebSocket-based speech processing service
Provides STT (Whisper), TTS, and ggwave communication for Ally
"""

import os
import sys
import time
import json
import queue
import threading
import asyncio
import websockets
import logging
import tempfile
import numpy as np
import pyaudio
import whisper
import webrtcvad
import collections
import ggwave
import wave
from TTS.api import TTS
import torch
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass, asdict
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class SpeechConfig:
    """Configuration for speech service"""
    # Speech recognition settings
    vad_mode: int = 1
    whisper_model: str = "base"
    chunk_duration_ms: int = 30
    silence_threshold: int = 2
    max_speech_chunks: int = 100
    min_speech_chunks: int = 10
    
    # Audio settings
    channels: int = 1
    rate: int = 16000
    sample_rate: int = 48000
    chunk_size: int = 1024
    
    # TTS settings
    tts_model: str = "tts_models/en/jenny/jenny"
    use_gpu: bool = True
    max_tts_length: int = 100
    max_sentence_length: int = 50
    
    # ggwave settings
    max_payload_size: int = 140
    protocol_id: int = 2
    volume: int = 20
    
    # WebSocket settings
    websocket_host: str = "localhost"
    websocket_port: int = 8765
    
    # Performance settings
    use_8bit: bool = True
    batch_size: int = 1

class SpeechService:
    """Main speech service class"""
    
    def __init__(self, config: SpeechConfig):
        self.config = config
        self.running = False
        self.shutdown_event = threading.Event()
        
        # Audio components
        self.vad = None
        self.pyaudio_instance = None
        self.ggwave_instance = None
        self.whisper_model = None
        self.tts_model = None
        
        # Queues
        self.audio_queue = queue.Queue(maxsize=5)
        self.text_queue = queue.Queue(maxsize=10)
        self.tts_queue = queue.Queue(maxsize=10)  # Increased for better queuing
        self.broadcast_queue = queue.Queue(maxsize=20)  # Queue for messages to broadcast
        
        # TTS processing state
        self.is_processing_tts = False
        self.current_tts_id = None
        self.tts_lock = threading.Lock()
        
        # Buffers
        self.speech_buffer = collections.deque()
        self.silence_counter = 0
        
        # WebSocket clients
        self.websocket_clients = set()
        
        # Device detection
        self.device = "cuda" if torch.cuda.is_available() and config.use_gpu else "cpu"
        logger.info(f"Using device: {self.device}")
        
        # Initialize components
        self._setup_audio()
        self._setup_models()
        
    def _setup_audio(self):
        """Initialize audio components"""
        try:
            self.vad = webrtcvad.Vad()
            self.vad.set_mode(self.config.vad_mode)
            self.pyaudio_instance = pyaudio.PyAudio()
            self.ggwave_instance = ggwave.init()
            logger.info("Audio components initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize audio components: {e}")
            raise
    
    def _setup_models(self):
        """Initialize AI models"""
        try:
            # Load Whisper model
            logger.info(f"Loading Whisper model: {self.config.whisper_model}")
            self.whisper_model = whisper.load_model(
                self.config.whisper_model,
                device=self.device
            )
            
            if hasattr(self.whisper_model, 'eval'):
                self.whisper_model.eval()
            
            # Load TTS model
            logger.info(f"Loading TTS model: {self.config.tts_model}")
            try:
                self.tts_model = TTS(
                    self.config.tts_model,
                    gpu=self.device == "cuda"
                )
                
                if self.device == "cuda" and hasattr(self.tts_model, 'to'):
                    self.tts_model.to(self.device)
                    
                logger.info("✅ TTS model loaded successfully")
            except Exception as e:
                logger.error(f"❌ Failed to load TTS model: {e}")
                logger.info("Continuing without TTS functionality")
                self.tts_model = None
                
            logger.info("AI models initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize AI models: {e}")
            raise
    
    async def start_websocket_server(self):
        """Start WebSocket server for communication with Ally"""
        async def handle_client(websocket, path=None):
            client_addr = getattr(websocket, 'remote_address', 'unknown')
            logger.info(f"✅ New WebSocket client connected: {client_addr} (path: {path or '/'})")
            self.websocket_clients.add(websocket)
            
            # Send welcome message
            try:
                await self._send_response(websocket, 'connected', {
                    'message': 'Connected to Ally Speech Service',
                    'version': '1.0.0'
                })
            except Exception as welcome_error:
                logger.error(f"Failed to send welcome message: {welcome_error}")
            
            try:
                async for message in websocket:
                    try:
                        logger.debug(f"📨 Received message from {client_addr}: {message[:100]}...")
                        await self._handle_websocket_message(websocket, message)
                    except Exception as msg_error:
                        logger.error(f"Error handling message from {client_addr}: {msg_error}")
                        # Send error response to client
                        try:
                            await self._send_response(websocket, 'error', {
                                'error': str(msg_error)
                            })
                        except:
                            pass  # Client might be disconnected
                            
            except websockets.exceptions.ConnectionClosed:
                logger.info(f"❌ WebSocket client disconnected normally: {client_addr}")
            except websockets.exceptions.ConnectionClosedError:
                logger.info(f"❌ WebSocket client connection closed unexpectedly: {client_addr}")
            except Exception as e:
                logger.error(f"❌ WebSocket error with {client_addr}: {e}")
            finally:
                self.websocket_clients.discard(websocket)
                logger.info(f"🧹 Cleaned up client {client_addr}")
        
        logger.info(f"🚀 Starting WebSocket server on {self.config.websocket_host}:{self.config.websocket_port}")
        try:
            server = await websockets.serve(
                handle_client,
                self.config.websocket_host,
                self.config.websocket_port
            )
            logger.info(f"✅ WebSocket server started successfully")
            return server
        except Exception as e:
            logger.error(f"❌ Failed to start WebSocket server: {e}")
            raise
    
    async def _handle_websocket_message(self, websocket, message):
        """Handle incoming WebSocket messages"""
        try:
            data = json.loads(message)
            command = data.get('command')
            payload = data.get('payload', {})
            
            # Store the last message data for context
            websocket._last_message_data = data
            
            if command == 'start_listening':
                await self._send_response(websocket, 'listening_started', {'status': 'ok'})
                
            elif command == 'stop_listening':
                await self._send_response(websocket, 'listening_stopped', {'status': 'ok'})
                
            elif command == 'synthesize_speech':
                text = payload.get('text', '')
                message_id = payload.get('messageId')
                if text:
                    await self._handle_tts_request(websocket, text, message_id)
                    
            elif command == 'stop_tts':
                await self._handle_stop_tts(websocket)
                    
            elif command == 'send_ggwave':
                text = payload.get('text', '')
                if text:
                    await self._handle_ggwave_request(websocket, text)
                    
            elif command == 'get_status':
                status = {
                    'listening': self.running,
                    'device': self.device,
                    'models_loaded': bool(self.whisper_model and self.tts_model),
                    'tts_queue_size': self.tts_queue.qsize(),
                    'is_processing_tts': self.is_processing_tts,
                    'current_tts_id': self.current_tts_id
                }
                await self._send_response(websocket, 'status', status)
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received from WebSocket client")
        except Exception as e:
            logger.error(f"Error handling WebSocket message: {e}")
    
    async def _send_response(self, websocket, command, payload):
        """Send response to WebSocket client"""
        try:
            response = json.dumps({
                'command': command,
                'payload': payload,
                'timestamp': time.time()
            })
            await websocket.send(response)
        except Exception as e:
            logger.error(f"Error sending WebSocket response: {e}")
    
    async def _broadcast_message(self, command, payload):
        """Broadcast message to all connected WebSocket clients"""
        if not self.websocket_clients:
            return
            
        message = json.dumps({
            'command': command,
            'payload': payload,
            'timestamp': time.time()
        })
        
        # Send to all clients
        disconnected_clients = set()
        for client in self.websocket_clients:
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed:
                disconnected_clients.add(client)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected_clients.add(client)
        
        # Remove disconnected clients
        self.websocket_clients -= disconnected_clients
    
    async def _handle_tts_request(self, websocket, text, message_id=None):
        """Handle TTS synthesis request"""
        if not self.tts_model:
            await self._send_response(websocket, 'speech_error', {
                'error': 'TTS model not loaded'
            })
            return
            
        try:
            logger.info(f"Processing TTS request for text: '{text[:50]}...' (ID: {message_id})")
            
            # Check if this is a streaming request
            payload = {'text': text}
            if hasattr(websocket, '_last_message_data'):
                payload = websocket._last_message_data.get('payload', {})
            
            streaming = payload.get('streaming', False)
            
            # Queue the TTS request for sequential processing
            tts_request = {
                'websocket': websocket,
                'text': text,
                'message_id': message_id,
                'streaming': streaming,
                'timestamp': time.time()
            }
            
            try:
                self.tts_queue.put_nowait(tts_request)
                logger.info(f"📝 Queued TTS request {message_id} (queue size: {self.tts_queue.qsize()})")
                
                # Start processing if not already processing
                asyncio.create_task(self._process_tts_queue())
                
            except queue.Full:
                logger.warning("TTS queue full, rejecting request")
                await self._send_response(websocket, 'speech_error', {
                    'error': 'TTS queue full, please try again later'
                })
                
        except Exception as e:
            logger.error(f"TTS request error: {e}")
            await self._send_response(websocket, 'speech_error', {
                'error': str(e)
            })
    
    async def _handle_stop_tts(self, websocket):
        """Handle stop TTS command"""
        try:
            with self.tts_lock:
                if self.is_processing_tts:
                    logger.info(f"⏹️ Stopping current TTS: {self.current_tts_id}")
                    # Clear the queue and reset processing state
                    while not self.tts_queue.empty():
                        try:
                            self.tts_queue.get_nowait()
                        except queue.Empty:
                            break
                    
                    self.is_processing_tts = False
                    self.current_tts_id = None
                    
                    await self._send_response(websocket, 'tts_stopped', {
                        'message': 'TTS processing stopped'
                    })
                else:
                    await self._send_response(websocket, 'tts_stopped', {
                        'message': 'No TTS currently processing'
                    })
        except Exception as e:
            logger.error(f"Error stopping TTS: {e}")
    
    async def _process_tts_queue(self):
        """Process TTS requests from queue sequentially"""
        with self.tts_lock:
            if self.is_processing_tts:
                return  # Already processing
            
            if self.tts_queue.empty():
                return  # Nothing to process
            
            self.is_processing_tts = True
        
        try:
            while not self.tts_queue.empty():
                try:
                    tts_request = self.tts_queue.get_nowait()
                    websocket = tts_request['websocket']
                    text = tts_request['text']
                    message_id = tts_request['message_id']
                    streaming = tts_request['streaming']
                    
                    self.current_tts_id = message_id
                    logger.info(f"🎵 Processing TTS {message_id} ({self.tts_queue.qsize()} remaining)")
                    
                    if streaming:
                        await self._handle_streaming_tts(websocket, text, message_id)
                    else:
                        await self._handle_single_tts(websocket, text, message_id)
                    
                    self.tts_queue.task_done()
                    
                except queue.Empty:
                    break
                except Exception as e:
                    logger.error(f"Error processing TTS request: {e}")
                    # Continue processing other requests
                    continue
        finally:
            with self.tts_lock:
                self.is_processing_tts = False
                self.current_tts_id = None
    
    async def _handle_streaming_tts(self, websocket, text, message_id=None):
        """Handle streaming TTS synthesis request"""
        try:
            # Check if we should stop processing
            with self.tts_lock:
                if not self.is_processing_tts or self.current_tts_id != message_id:
                    logger.info(f"TTS {message_id} cancelled or superseded")
                    return
            
            # Split text into sentences for streaming
            sentences = self._split_into_sentences(text)
            
            logger.info(f"Streaming TTS for {len(sentences)} sentences (ID: {message_id})")
            
            # Send start streaming signal
            await self._send_response(websocket, 'tts_stream_start', {
                'total_sentences': len(sentences),
                'text': text,
                'message_id': message_id
            })
            
            # Process each sentence
            for i, sentence in enumerate(sentences):
                # Check if we should stop processing
                with self.tts_lock:
                    if not self.is_processing_tts or self.current_tts_id != message_id:
                        logger.info(f"TTS {message_id} cancelled during processing")
                        return
                
                if sentence.strip():
                    logger.info(f"Processing sentence {i+1}/{len(sentences)}: '{sentence[:30]}...'")
                    
                    # Generate speech for this sentence
                    loop = asyncio.get_event_loop()
                    wav_file = await loop.run_in_executor(None, self._generate_speech, sentence.strip())
                    
                    if wav_file and os.path.exists(wav_file):
                        # Read the audio file and send as base64
                        with open(wav_file, 'rb') as f:
                            audio_data = f.read()
                        
                        import base64
                        audio_b64 = base64.b64encode(audio_data).decode('utf-8')
                        
                        await self._send_response(websocket, 'tts_stream_chunk', {
                            'audio_data': audio_b64,
                            'text': sentence.strip(),
                            'chunk_index': i,
                            'total_chunks': len(sentences),
                            'is_final': i == len(sentences) - 1,
                            'message_id': message_id
                        })
                        
                        # Clean up temp file
                        os.remove(wav_file)
                        
                        # Small delay to allow client to process
                        await asyncio.sleep(0.1)
                    else:
                        logger.error(f"Failed to generate speech for sentence: {sentence[:30]}...")
            
            # Send completion signal
            await self._send_response(websocket, 'tts_stream_complete', {
                'text': text,
                'total_chunks': len(sentences),
                'message_id': message_id
            })
            
        except Exception as e:
            logger.error(f"Streaming TTS error: {e}")
            await self._send_response(websocket, 'tts_stream_error', {
                'error': str(e),
                'message_id': message_id
            })
    
    async def _handle_single_tts(self, websocket, text, message_id=None):
        """Handle single-shot TTS synthesis request (legacy)"""
        try:
            # Check if we should stop processing
            with self.tts_lock:
                if not self.is_processing_tts or self.current_tts_id != message_id:
                    logger.info(f"TTS {message_id} cancelled")
                    return
            
            # Generate speech in a separate thread to avoid blocking
            loop = asyncio.get_event_loop()
            wav_file = await loop.run_in_executor(None, self._generate_speech, text)
            
            if wav_file and os.path.exists(wav_file):
                # Read the audio file and send as base64
                with open(wav_file, 'rb') as f:
                    audio_data = f.read()
                
                import base64
                audio_b64 = base64.b64encode(audio_data).decode('utf-8')
                
                await self._send_response(websocket, 'speech_generated', {
                    'audio_data': audio_b64,
                    'text': text,
                    'message_id': message_id
                })
                
                # Clean up temp file
                os.remove(wav_file)
            else:
                await self._send_response(websocket, 'speech_error', {
                    'error': 'Failed to generate speech',
                    'message_id': message_id
                })
        except Exception as e:
            logger.error(f"Single TTS error: {e}")
            await self._send_response(websocket, 'speech_error', {
                'error': str(e),
                'message_id': message_id
            })
    
    def _split_into_sentences(self, text: str) -> list:
        """Split text into sentences for streaming TTS"""
        import re
        
        # Remove thinking sections and formatting
        clean_text = text
        
        # Remove thinking sections
        clean_text = re.sub(r'💭\s*\*\*Thinking\.\.\.\*\*\s*\n\n.*?\n\n---\n\n\*\*Answer:\*\*\s*\n\n', '', clean_text, flags=re.DOTALL)
        clean_text = re.sub(r'💭\s*\*\*Thought Process:\*\*\s*\n\n.*?\n\n---\n\n\*\*Answer:\*\*\s*\n\n', '', clean_text, flags=re.DOTALL)
        
        # Remove markdown formatting
        clean_text = re.sub(r'\*\*(.*?)\*\*', r'\1', clean_text)  # Bold
        clean_text = re.sub(r'\*(.*?)\*', r'\1', clean_text)      # Italic
        clean_text = re.sub(r'`(.*?)`', r'\1', clean_text)        # Code
        clean_text = re.sub(r'#{1,6}\s*(.*)', r'\1', clean_text)  # Headers
        
        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', clean_text.strip())
        
        # Filter out empty sentences and very short ones
        sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 3]
        
        # Merge very short sentences with the next one
        merged_sentences = []
        i = 0
        while i < len(sentences):
            current = sentences[i]
            
            # If current sentence is very short and there's a next one, merge them
            if len(current) < 20 and i + 1 < len(sentences):
                current += " " + sentences[i + 1]
                i += 2
            else:
                i += 1
            
            # Limit sentence length for better TTS
            if len(current) > self.config.max_sentence_length:
                # Split long sentences at commas or other natural breaks
                parts = re.split(r'(?<=,)\s+', current)
                merged_sentences.extend(parts)
            else:
                merged_sentences.append(current)
        
        return merged_sentences
    
    def _generate_speech(self, text: str) -> Optional[str]:
        """Generate speech file from text"""
        try:
            logger.info(f"Generating speech for: '{text[:50]}...'")
            # Create temporary file
            temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            temp_file.close()
            
            # Generate speech
            with torch.no_grad():
                self.tts_model.tts_to_file(
                    text=text,
                    file_path=temp_file.name
                )
            
            logger.info(f"✅ Speech generated successfully: {temp_file.name}")
            return temp_file.name
            
        except Exception as e:
            logger.error(f"❌ Speech generation error: {e}")
            return None
    
    async def _handle_ggwave_request(self, websocket, text):
        """Handle ggwave transmission request"""
        try:
            # Generate ggwave audio in a separate thread
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(None, self._send_ggwave, text)
            
            await self._send_response(websocket, 'ggwave_sent', {
                'success': success,
                'text': text
            })
            
        except Exception as e:
            logger.error(f"ggwave request error: {e}")
            await self._send_response(websocket, 'ggwave_error', {
                'error': str(e)
            })
    
    def _send_ggwave(self, text: str) -> bool:
        """Send text via ggwave"""
        try:
            # Split text into chunks if needed
            chunks = [text[i:i + self.config.max_payload_size] 
                     for i in range(0, len(text), self.config.max_payload_size)]
            
            # Create output stream
            output_stream = self.pyaudio_instance.open(
                format=pyaudio.paFloat32,
                channels=1,
                rate=self.config.sample_rate,
                output=True,
                frames_per_buffer=4096
            )
            
            try:
                for chunk in chunks:
                    # Encode chunk
                    waveform = ggwave.encode(
                        chunk,
                        protocolId=self.config.protocol_id,
                        volume=self.config.volume
                    )
                    
                    # Play waveform
                    output_stream.write(waveform, len(waveform) // 4)
                    time.sleep(0.1)  # Small delay between chunks
                    
                return True
                
            finally:
                output_stream.stop_stream()
                output_stream.close()
                
        except Exception as e:
            logger.error(f"ggwave transmission error: {e}")
            return False
    
    def start_audio_capture_thread(self):
        """Start audio capture in a separate thread"""
        def audio_capture():
            logger.info("Starting audio capture thread...")
            try:
                stream = self.pyaudio_instance.open(
                    format=pyaudio.paInt16,
                    channels=self.config.channels,
                    rate=self.config.rate,
                    input=True,
                    frames_per_buffer=int(self.config.rate * self.config.chunk_duration_ms / 1000)
                )
                
                while not self.shutdown_event.is_set():
                    try:
                        chunk_size = int(self.config.rate * self.config.chunk_duration_ms / 1000)
                        data = stream.read(chunk_size, exception_on_overflow=False)
                        is_speech = self.vad.is_speech(data, self.config.rate)
                        
                        if is_speech:
                            self.speech_buffer.append(data)
                            self.silence_counter = 0
                        else:
                            self.silence_counter += 1
                            self._process_speech_buffer()
                            
                    except Exception as e:
                        logger.error(f"Error in audio capture: {e}")
                        
            finally:
                stream.stop_stream()
                stream.close()
        
        thread = threading.Thread(target=audio_capture, daemon=True)
        thread.start()
        return thread
    
    def _process_speech_buffer(self):
        """Process accumulated speech buffer"""
        if len(self.speech_buffer) >= self.config.min_speech_chunks:
            if (self.silence_counter >= self.config.silence_threshold or 
                len(self.speech_buffer) >= self.config.max_speech_chunks):
                
                if self.audio_queue.qsize() < 3:
                    audio_data = b''.join(self.speech_buffer)
                    try:
                        self.audio_queue.put_nowait(audio_data)
                    except queue.Full:
                        logger.warning("Audio queue full, dropping speech data")
                
                self.speech_buffer.clear()
    
    def start_speech_recognition_thread(self):
        """Start speech recognition in a separate thread"""
        def speech_recognition():
            logger.info("Starting speech recognition thread...")
            
            while not self.shutdown_event.is_set():
                try:
                    audio_data = self.audio_queue.get(timeout=1.0)
                    
                    # Process audio
                    audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
                    
                    with torch.no_grad():
                        if self.device == "cuda":
                            audio_tensor = torch.from_numpy(audio_np).to(self.device)
                        else:
                            audio_tensor = audio_np
                        
                        transcription_options = {
                            "language": "en",
                            "task": "transcribe",
                            "fp16": self.device == "cuda",
                            "beam_size": 3,
                            "without_timestamps": True
                        }
                        
                        result = self.whisper_model.transcribe(audio_tensor, **transcription_options)
                    
                    if result["text"].strip():
                        text = result["text"].strip()
                        logger.info(f"Recognized: {text}")
                        
                        # Queue message for broadcasting
                        try:
                            self.broadcast_queue.put_nowait(('speech_recognized', {
                                'text': text,
                                'confidence': 1.0  # Whisper doesn't provide confidence scores
                            }))
                        except queue.Full:
                            logger.warning("Broadcast queue full, dropping speech recognition result")
                    
                    self.audio_queue.task_done()
                    
                    # Clear GPU memory
                    if self.device == "cuda":
                        torch.cuda.empty_cache()
                        
                except queue.Empty:
                    continue
                except Exception as e:
                    logger.error(f"Error in speech recognition: {e}")
        
        thread = threading.Thread(target=speech_recognition, daemon=True)
        thread.start()
        return thread
    
    async def _broadcast_handler(self):
        """Handle broadcasting messages from the queue"""
        while self.running:
            try:
                # Check for messages to broadcast (non-blocking)
                try:
                    command, payload = self.broadcast_queue.get_nowait()
                    await self._broadcast_message(command, payload)
                    self.broadcast_queue.task_done()
                except queue.Empty:
                    pass
                
                # Small delay to prevent busy waiting
                await asyncio.sleep(0.01)
                
            except Exception as e:
                logger.error(f"Error in broadcast handler: {e}")
                await asyncio.sleep(0.1)

    async def start(self):
        """Start the speech service"""
        logger.info("Starting Ally Speech Service...")
        
        self.running = True
        
        # Start audio processing threads
        audio_thread = self.start_audio_capture_thread()
        recognition_thread = self.start_speech_recognition_thread()
        
        # Start WebSocket server
        server = await self.start_websocket_server()
        
        # Start broadcast handler
        broadcast_task = asyncio.create_task(self._broadcast_handler())
        
        logger.info("Speech service started successfully")
        
        try:
            # Keep the service running
            while self.running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            logger.info("Received shutdown signal")
        finally:
            broadcast_task.cancel()
            await self.stop()
    
    async def stop(self):
        """Stop the speech service"""
        logger.info("Stopping speech service...")
        
        self.running = False
        self.shutdown_event.set()
        
        # Close WebSocket connections
        for client in self.websocket_clients.copy():
            await client.close()
        
        # Cleanup audio
        if self.pyaudio_instance:
            self.pyaudio_instance.terminate()
        
        logger.info("Speech service stopped")

async def main():
    """Main entry point"""
    # Load configuration
    config = SpeechConfig()
    
    # Override config from environment variables if present
    if os.getenv('WHISPER_MODEL'):
        config.whisper_model = os.getenv('WHISPER_MODEL')
    if os.getenv('TTS_MODEL'):
        config.tts_model = os.getenv('TTS_MODEL')
    if os.getenv('WEBSOCKET_PORT'):
        config.websocket_port = int(os.getenv('WEBSOCKET_PORT'))
    
    # Create and start service
    service = SpeechService(config)
    await service.start()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Service interrupted by user")
    except Exception as e:
        logger.error(f"Service failed: {e}")
        sys.exit(1)