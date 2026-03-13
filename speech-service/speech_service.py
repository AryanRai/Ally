#!/usr/bin/env python3
"""
Ally Speech Service - WebSocket-based speech processing service
Provides STT (Whisper / Deepgram Nova-2) and TTS (Coqui / ElevenLabs Flash v2.5),
plus ggwave communication for Ally.

Streaming backends are selected via environment variables:
  STT_MODE=deepgram   (or 'whisper' for offline)
  TTS_MODE=elevenlabs (or 'coqui' for offline)
"""

import os
import sys
import time
import json
import queue
import threading
import asyncio
import base64
import websockets
import logging
import tempfile
import numpy as np
import pyaudio
import webrtcvad
import collections
import ggwave
import wave
from typing import Optional, Dict, Any, Callable, AsyncGenerator
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
    # Backend selection
    stt_mode: str = "whisper"       # 'whisper' or 'deepgram'
    tts_mode: str = "coqui"         # 'coqui' or 'elevenlabs'

    # Deepgram settings
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-2"
    deepgram_utterance_end_ms: int = 1000
    deepgram_endpointing_ms: int = 300

    # ElevenLabs settings
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"   # default: Rachel
    elevenlabs_model: str = "eleven_flash_v2_5"

    # Speech recognition settings (Whisper)
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
    
    # TTS settings (Coqui / fallback)
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



# ---------------------------------------------------------------------------
# Deepgram streaming STT
# ---------------------------------------------------------------------------

class DeepgramSTTService:
    """
    Real-time STT using Deepgram Nova-2 streaming WebSocket API.
    Emits interim and final transcripts via async callbacks.

    Requires: deepgram-sdk>=3.0.0
    Env: DEEPGRAM_API_KEY
    """

    def __init__(
        self,
        api_key: str,
        model: str = "nova-2",
        utterance_end_ms: int = 1000,
        endpointing_ms: int = 300,
        on_interim: Optional[Callable] = None,
        on_final: Optional[Callable] = None,
        on_speech_started: Optional[Callable] = None,
    ):
        self.api_key = api_key
        self.model = model
        self.utterance_end_ms = utterance_end_ms
        self.endpointing_ms = endpointing_ms
        self.on_interim = on_interim
        self.on_final = on_final
        self.on_speech_started = on_speech_started
        self._connection = None
        self._audio_stream = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    async def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        try:
            from deepgram import (
                DeepgramClient,
                LiveTranscriptionEvents,
                LiveOptions,
            )
        except ImportError:
            raise RuntimeError(
                "deepgram-sdk is not installed. "
                "Run: pip install 'deepgram-sdk>=3.0.0'"
            )

        client = DeepgramClient(self.api_key)
        conn = client.listen.asyncwebsocket.v("1")

        async def _on_transcript(result, **kwargs):
            try:
                alt = result.channel.alternatives[0]
                text = alt.transcript
                if not text:
                    return
                if result.is_final:
                    if self.on_final:
                        await self.on_final(text)
                else:
                    if self.on_interim:
                        await self.on_interim(text)
            except Exception as exc:
                logger.error(f"Deepgram transcript callback error: {exc}")

        async def _on_speech_started(evt, **kwargs):
            if self.on_speech_started:
                await self.on_speech_started()

        conn.on(LiveTranscriptionEvents.Transcript, _on_transcript)
        conn.on(LiveTranscriptionEvents.SpeechStarted, _on_speech_started)

        options = LiveOptions(
            model=self.model,
            language="en-US",
            smart_format=True,
            interim_results=True,
            utterance_end_ms=str(self.utterance_end_ms),
            vad_events=True,
            endpointing=str(self.endpointing_ms),
            filler_words=False,
            punctuate=True,
        )
        await conn.start(options)
        self._connection = conn

        # Open microphone and stream raw PCM to Deepgram
        p = pyaudio.PyAudio()
        self._audio_stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=16000,
            input=True,
            frames_per_buffer=1024,
            stream_callback=self._audio_callback,
        )
        self._audio_stream.start_stream()
        logger.info("✅ Deepgram STT streaming started")

    def _audio_callback(self, in_data, frame_count, time_info, status):
        if self._connection and self._loop:
            asyncio.run_coroutine_threadsafe(
                self._connection.send(in_data), self._loop
            )
        return (None, pyaudio.paContinue)

    async def stop(self) -> None:
        if self._audio_stream:
            try:
                self._audio_stream.stop_stream()
                self._audio_stream.close()
            except Exception:
                pass
            self._audio_stream = None
        if self._connection:
            try:
                await self._connection.finish()
            except Exception:
                pass
            self._connection = None
        logger.info("Deepgram STT streaming stopped")


# ---------------------------------------------------------------------------
# ElevenLabs streaming TTS
# ---------------------------------------------------------------------------

class ElevenLabsTTSService:
    """
    Real-time TTS using ElevenLabs Flash v2.5 streaming WebSocket API.
    Accepts a plain string; yields raw MP3 audio chunks via callback.

    Requires: websockets>=12.0
    Env: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID
    """

    WS_URL_TEMPLATE = (
        "wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
        "?model_id={model_id}&output_format=mp3_44100_128"
    )

    def __init__(
        self,
        api_key: str,
        voice_id: str,
        model_id: str = "eleven_flash_v2_5",
    ):
        self.api_key = api_key
        self.voice_id = voice_id
        self.model_id = model_id
        self._stop_flag = False

    async def stream_speak(
        self,
        text: str,
        on_audio_chunk: Callable,
    ) -> None:
        """
        Synthesise *text* and call `on_audio_chunk(bytes)` for every MP3 chunk.
        `on_audio_chunk` may be a coroutine or a plain callable.
        """
        self._stop_flag = False
        url = self.WS_URL_TEMPLATE.format(
            voice_id=self.voice_id,
            model_id=self.model_id,
        )
        try:
            async with websockets.connect(
                url,
                additional_headers={"xi-api-key": self.api_key},
                open_timeout=10,
            ) as ws:
                # --- BOS message ---
                await ws.send(
                    json.dumps(
                        {
                            "text": " ",
                            "voice_settings": {
                                "stability": 0.5,
                                "similarity_boost": 0.75,
                                "speed": 1.0,
                            },
                            "generation_config": {
                                "chunk_length_schedule": [50, 120, 160, 290]
                            },
                        }
                    )
                )

                # --- Send text then EOS ---
                await ws.send(json.dumps({"text": text}))
                await ws.send(json.dumps({"text": ""}))

                # --- Receive and stream audio chunks ---
                async for raw in ws:
                    if self._stop_flag:
                        break
                    try:
                        data = json.loads(raw)
                        if data.get("audio"):
                            chunk = base64.b64decode(data["audio"])
                            if asyncio.iscoroutinefunction(on_audio_chunk):
                                await on_audio_chunk(chunk)
                            else:
                                on_audio_chunk(chunk)
                    except Exception as exc:
                        logger.error(f"ElevenLabs audio chunk error: {exc}")

        except Exception as exc:
            logger.error(f"ElevenLabs WebSocket error: {exc}")
            raise

    def stop(self) -> None:
        self._stop_flag = True


# ---------------------------------------------------------------------------
# TTS Router  (ElevenLabs primary, Coqui fallback)
# ---------------------------------------------------------------------------

class TTSRouter:
    """
    Routes TTS requests to ElevenLabs (streaming) or Coqui (offline fallback).
    Falls back automatically if ElevenLabs raises an exception.
    """

    def __init__(self, config: "SpeechConfig"):
        self.config = config
        self._elevenlabs: Optional[ElevenLabsTTSService] = None
        self._coqui_model = None          # set by SpeechService after load
        self._coqui_device: str = "cpu"
        self._mode: str = config.tts_mode  # 'elevenlabs' or 'coqui'

        if self._mode == "elevenlabs":
            if not config.elevenlabs_api_key:
                logger.warning(
                    "TTS_MODE=elevenlabs but ELEVENLABS_API_KEY is not set. "
                    "Falling back to Coqui."
                )
                self._mode = "coqui"
            else:
                self._elevenlabs = ElevenLabsTTSService(
                    api_key=config.elevenlabs_api_key,
                    voice_id=config.elevenlabs_voice_id,
                    model_id=config.elevenlabs_model,
                )

    def set_coqui_model(self, model, device: str) -> None:
        self._coqui_model = model
        self._coqui_device = device

    async def speak(
        self,
        text: str,
        on_audio_chunk: Callable,
        on_coqui_file: Optional[Callable] = None,
    ) -> None:
        """
        Speak *text*. For ElevenLabs, calls on_audio_chunk per MP3 chunk.
        For Coqui, calls on_coqui_file with the path to the generated WAV.
        """
        if self._mode == "elevenlabs" and self._elevenlabs:
            try:
                await self._elevenlabs.stream_speak(text, on_audio_chunk)
                return
            except Exception as exc:
                logger.error(f"ElevenLabs failed ({exc}); falling back to Coqui")
        # --- Coqui fallback ---
        if self._coqui_model and on_coqui_file:
            loop = asyncio.get_event_loop()
            wav_path = await loop.run_in_executor(
                None, self._generate_coqui, text
            )
            if wav_path:
                await on_coqui_file(wav_path)
        else:
            logger.error("No TTS backend available")

    def _generate_coqui(self, text: str) -> Optional[str]:
        try:
            import torch
            tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp.close()
            with torch.no_grad():
                self._coqui_model.tts_to_file(text=text, file_path=tmp.name)
            return tmp.name
        except Exception as exc:
            logger.error(f"Coqui synthesis error: {exc}")
            return None

    def stop(self) -> None:
        if self._elevenlabs:
            self._elevenlabs.stop()


# ---------------------------------------------------------------------------
# Interrupt Manager
# ---------------------------------------------------------------------------

class InterruptManager:
    """
    Detects user voice during TTS playback and triggers barge-in.
    Works with both Deepgram (VAD events) and Whisper (silence detection).
    """

    def __init__(self):
        self._is_speaking = False
        self._should_interrupt = False
        self._on_interrupt: Optional[Callable] = None

    def set_interrupt_callback(self, cb: Callable) -> None:
        self._on_interrupt = cb

    def on_tts_started(self) -> None:
        self._is_speaking = True
        self._should_interrupt = False

    def on_tts_finished(self) -> None:
        self._is_speaking = False
        self._should_interrupt = False

    async def on_speech_started(self) -> None:
        """Called when VAD detects the user has started speaking."""
        if self._is_speaking and not self._should_interrupt:
            logger.info("🛑 Barge-in detected — interrupting TTS")
            self._should_interrupt = True
            if self._on_interrupt:
                if asyncio.iscoroutinefunction(self._on_interrupt):
                    await self._on_interrupt()
                else:
                    self._on_interrupt()

    @property
    def should_interrupt(self) -> bool:
        return self._should_interrupt


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

        # Whisper model (used when stt_mode='whisper')
        self.whisper_model = None
        # Coqui TTS model (used when tts_mode='coqui' or as fallback)
        self.tts_model = None

        # Streaming backends
        self.deepgram_stt: Optional[DeepgramSTTService] = None
        self.tts_router = TTSRouter(config)
        self.interrupt_manager = InterruptManager()
        self.interrupt_manager.set_interrupt_callback(self._on_barge_in)
        
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
        
        # Device detection (used for Whisper / Coqui)
        try:
            import torch as _torch
            self.device = "cuda" if _torch.cuda.is_available() and config.use_gpu else "cpu"
        except ImportError:
            self.device = "cpu"
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
        """Initialize AI models based on configured backends."""
        # --- STT ---
        if self.config.stt_mode == "deepgram":
            if self.config.deepgram_api_key:
                logger.info("STT backend: Deepgram Nova-2 (streaming)")
                # DeepgramSTTService is started lazily in start() because it needs the event loop
            else:
                logger.warning(
                    "STT_MODE=deepgram but DEEPGRAM_API_KEY not set; "
                    "falling back to Whisper"
                )
                self.config.stt_mode = "whisper"

        if self.config.stt_mode == "whisper":
            try:
                import whisper as _whisper
                logger.info(f"STT backend: Whisper ({self.config.whisper_model})")
                self.whisper_model = _whisper.load_model(
                    self.config.whisper_model, device=self.device
                )
                if hasattr(self.whisper_model, "eval"):
                    self.whisper_model.eval()
            except Exception as e:
                logger.error(f"Failed to load Whisper model: {e}")
                raise

        # --- TTS ---
        if self.config.tts_mode in ("coqui", "whisper") or (
            self.config.tts_mode == "elevenlabs" and not self.config.elevenlabs_api_key
        ):
            # Load Coqui as primary or fallback
            logger.info(f"TTS backend: Coqui ({self.config.tts_model})")
            try:
                from TTS.api import TTS as _TTS
                self.tts_model = _TTS(
                    self.config.tts_model, gpu=self.device == "cuda"
                )
                import torch as _torch
                if self.device == "cuda" and hasattr(self.tts_model, "to"):
                    self.tts_model.to(self.device)
                logger.info("✅ Coqui TTS model loaded")
            except Exception as e:
                logger.error(f"❌ Failed to load Coqui TTS model: {e}")
                logger.info("Continuing without offline TTS")
                self.tts_model = None
        else:
            logger.info("TTS backend: ElevenLabs Flash v2.5 (streaming)")

        # Tell the router about the Coqui model (may be None if not loaded)
        self.tts_router.set_coqui_model(self.tts_model, self.device)
        
        logger.info("AI models initialized successfully")
    
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
                stt_ready = (
                    self.deepgram_stt is not None
                    if self.config.stt_mode == "deepgram"
                    else bool(self.whisper_model)
                )
                tts_ready = (
                    bool(self.config.elevenlabs_api_key)
                    if self.config.tts_mode == "elevenlabs"
                    else bool(self.tts_model)
                )
                status = {
                    'listening': self.running,
                    'device': self.device,
                    'models_loaded': stt_ready and tts_ready,
                    'stt_mode': self.config.stt_mode,
                    'tts_mode': self.config.tts_mode,
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
        """Handle TTS synthesis request (queues for sequential playback)."""
        # For ElevenLabs we don't need the Coqui model — check accordingly
        tts_available = (
            bool(self.config.elevenlabs_api_key)
            if self.config.tts_mode == "elevenlabs"
            else bool(self.tts_model)
        )
        if not tts_available:
            await self._send_response(websocket, 'speech_error', {
                'error': 'TTS backend not available'
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
        """Handle streaming TTS synthesis request.
        
        When ElevenLabs is active: streams raw MP3 chunks to the client.
        When Coqui is active (offline): falls back to sentence-by-sentence WAV streaming.
        """
        try:
            with self.tts_lock:
                if not self.is_processing_tts or self.current_tts_id != message_id:
                    logger.info(f"TTS {message_id} cancelled or superseded")
                    return

            self.interrupt_manager.on_tts_started()

            # ----------------------------------------------------------------
            # ElevenLabs path: true streaming, one chunk at a time
            # ----------------------------------------------------------------
            if self.config.tts_mode == "elevenlabs" and self.config.elevenlabs_api_key:
                logger.info(f"🎵 ElevenLabs streaming TTS (ID: {message_id})")
                await self._send_response(websocket, 'tts_stream_start', {
                    'total_sentences': 1,
                    'text': text,
                    'message_id': message_id,
                    'backend': 'elevenlabs',
                })
                chunk_index = 0

                async def _send_chunk(chunk: bytes):
                    nonlocal chunk_index
                    if self.interrupt_manager.should_interrupt:
                        return
                    audio_b64 = base64.b64encode(chunk).decode('utf-8')
                    await self._send_response(websocket, 'tts_stream_chunk', {
                        'audio_data': audio_b64,
                        'audio_format': 'mp3',
                        'chunk_index': chunk_index,
                        'total_chunks': -1,   # unknown up front
                        'is_final': False,
                        'message_id': message_id,
                    })
                    chunk_index += 1

                async def _coqui_fallback(wav_path: str):
                    with open(wav_path, 'rb') as f:
                        raw = f.read()
                    os.remove(wav_path)
                    audio_b64 = base64.b64encode(raw).decode('utf-8')
                    await self._send_response(websocket, 'tts_stream_chunk', {
                        'audio_data': audio_b64,
                        'audio_format': 'wav',
                        'chunk_index': 0,
                        'total_chunks': 1,
                        'is_final': True,
                        'message_id': message_id,
                    })

                await self.tts_router.speak(text, _send_chunk, _coqui_fallback)

                await self._send_response(websocket, 'tts_stream_complete', {
                    'text': text,
                    'total_chunks': chunk_index,
                    'message_id': message_id,
                })

            # ----------------------------------------------------------------
            # Coqui path: sentence-by-sentence WAV streaming (unchanged)
            # ----------------------------------------------------------------
            else:
                sentences = self._split_into_sentences(text)
                logger.info(f"Coqui streaming TTS for {len(sentences)} sentences (ID: {message_id})")

                await self._send_response(websocket, 'tts_stream_start', {
                    'total_sentences': len(sentences),
                    'text': text,
                    'message_id': message_id,
                    'backend': 'coqui',
                })

                for i, sentence in enumerate(sentences):
                    with self.tts_lock:
                        if not self.is_processing_tts or self.current_tts_id != message_id:
                            logger.info(f"TTS {message_id} cancelled during processing")
                            return
                    if self.interrupt_manager.should_interrupt:
                        logger.info(f"TTS {message_id} interrupted by barge-in")
                        break

                    if sentence.strip():
                        loop = asyncio.get_event_loop()
                        wav_file = await loop.run_in_executor(
                            None, self._generate_speech, sentence.strip()
                        )
                        if wav_file and os.path.exists(wav_file):
                            with open(wav_file, 'rb') as f:
                                audio_data = f.read()
                            audio_b64 = base64.b64encode(audio_data).decode('utf-8')
                            await self._send_response(websocket, 'tts_stream_chunk', {
                                'audio_data': audio_b64,
                                'audio_format': 'wav',
                                'text': sentence.strip(),
                                'chunk_index': i,
                                'total_chunks': len(sentences),
                                'is_final': i == len(sentences) - 1,
                                'message_id': message_id,
                            })
                            os.remove(wav_file)
                            await asyncio.sleep(0.1)

                await self._send_response(websocket, 'tts_stream_complete', {
                    'text': text,
                    'total_chunks': len(sentences),
                    'message_id': message_id,
                })

        except Exception as e:
            logger.error(f"Streaming TTS error: {e}")
            await self._send_response(websocket, 'tts_stream_error', {
                'error': str(e),
                'message_id': message_id,
            })
        finally:
            self.interrupt_manager.on_tts_finished()
    
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
        """Generate speech file from text (Coqui TTS)."""
        try:
            logger.info(f"Generating speech for: '{text[:50]}...'")
            temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            temp_file.close()
            try:
                import torch as _torch
                with _torch.no_grad():
                    self.tts_model.tts_to_file(text=text, file_path=temp_file.name)
            except ImportError:
                self.tts_model.tts_to_file(text=text, file_path=temp_file.name)
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
        """Start Whisper speech recognition in a separate thread.
        Only started when stt_mode='whisper'. Deepgram handles its own audio capture.
        """
        def speech_recognition():
            logger.info("Starting Whisper speech recognition thread...")
            
            while not self.shutdown_event.is_set():
                try:
                    audio_data = self.audio_queue.get(timeout=1.0)
                    
                    # Process audio
                    audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
                    
                    try:
                        import torch as _torch
                        with _torch.no_grad():
                            if self.device == "cuda":
                                audio_tensor = _torch.from_numpy(audio_np).to(self.device)
                            else:
                                audio_tensor = audio_np
                            transcription_options = {
                                "language": "en",
                                "task": "transcribe",
                                "fp16": self.device == "cuda",
                                "beam_size": 3,
                                "without_timestamps": True,
                            }
                            result = self.whisper_model.transcribe(audio_tensor, **transcription_options)
                    except ImportError:
                        result = self.whisper_model.transcribe(audio_np)

                    if result["text"].strip():
                        text = result["text"].strip()
                        logger.info(f"Whisper recognized: {text}")
                        try:
                            self.broadcast_queue.put_nowait(('speech_recognized', {
                                'text': text,
                                'confidence': 1.0,
                            }))
                        except queue.Full:
                            logger.warning("Broadcast queue full, dropping recognition result")
                    
                    self.audio_queue.task_done()
                    
                    try:
                        import torch as _torch
                        if self.device == "cuda":
                            _torch.cuda.empty_cache()
                    except ImportError:
                        pass
                        
                except queue.Empty:
                    continue
                except Exception as e:
                    logger.error(f"Error in speech recognition: {e}")
        
        thread = threading.Thread(target=speech_recognition, daemon=True)
        thread.start()
        return thread

    # ------------------------------------------------------------------
    # Barge-in handler (called by InterruptManager)
    # ------------------------------------------------------------------

    def _on_barge_in(self) -> None:
        """Stop TTS and notify clients of interruption (sync wrapper)."""
        # Stop ElevenLabs streaming if active
        self.tts_router.stop()
        # Clear queue
        while not self.tts_queue.empty():
            try:
                self.tts_queue.get_nowait()
            except queue.Empty:
                break
        with self.tts_lock:
            self.is_processing_tts = False
            self.current_tts_id = None
        # Broadcast to UI
        try:
            self.broadcast_queue.put_nowait(('speech_interrupted', {}))
        except queue.Full:
            pass

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
        loop = asyncio.get_event_loop()
        
        # --- STT setup ---
        if self.config.stt_mode == "deepgram":
            # Wire Deepgram callbacks to broadcast queue + interrupt manager
            async def _on_interim(text: str):
                try:
                    self.broadcast_queue.put_nowait(('speech_interim', {'text': text}))
                except queue.Full:
                    pass

            async def _on_final(text: str):
                logger.info(f"Deepgram final: {text}")
                try:
                    self.broadcast_queue.put_nowait(('speech_recognized', {
                        'text': text, 'confidence': 1.0
                    }))
                except queue.Full:
                    pass

            async def _on_speech_started():
                await self.interrupt_manager.on_speech_started()

            self.deepgram_stt = DeepgramSTTService(
                api_key=self.config.deepgram_api_key,
                model=self.config.deepgram_model,
                utterance_end_ms=self.config.deepgram_utterance_end_ms,
                endpointing_ms=self.config.deepgram_endpointing_ms,
                on_interim=_on_interim,
                on_final=_on_final,
                on_speech_started=_on_speech_started,
            )
            await self.deepgram_stt.start(loop)
            logger.info("✅ Deepgram STT started")
        else:
            # Whisper: start VAD + audio capture + recognition threads
            audio_thread = self.start_audio_capture_thread()
            recognition_thread = self.start_speech_recognition_thread()
        
        # Start WebSocket server
        server = await self.start_websocket_server()
        
        # Start broadcast handler
        broadcast_task = asyncio.create_task(self._broadcast_handler())
        
        logger.info("Speech service started successfully")
        
        try:
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

        # Stop Deepgram STT if running
        if self.deepgram_stt:
            await self.deepgram_stt.stop()

        # Stop TTS router (ElevenLabs streaming)
        self.tts_router.stop()
        
        # Close WebSocket connections
        for client in self.websocket_clients.copy():
            await client.close()
        
        # Cleanup audio
        if self.pyaudio_instance:
            self.pyaudio_instance.terminate()
        
        logger.info("Speech service stopped")

async def main():
    """Main entry point"""
    config = SpeechConfig()
    
    # STT / TTS backend selection
    config.stt_mode = os.getenv('STT_MODE', 'whisper')
    config.tts_mode = os.getenv('TTS_MODE', 'coqui')

    # API keys for streaming backends
    config.deepgram_api_key = os.getenv('DEEPGRAM_API_KEY', '')
    config.elevenlabs_api_key = os.getenv('ELEVENLABS_API_KEY', '')
    config.elevenlabs_voice_id = os.getenv(
        'ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'
    )

    # Legacy / offline model overrides
    if os.getenv('WHISPER_MODEL'):
        config.whisper_model = os.getenv('WHISPER_MODEL')
    if os.getenv('TTS_MODEL'):
        config.tts_model = os.getenv('TTS_MODEL')
    if os.getenv('WEBSOCKET_PORT'):
        config.websocket_port = int(os.getenv('WEBSOCKET_PORT'))
    
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