#!/usr/bin/env python3
"""
Startup script for Ally Speech Service
Handles environment setup and service initialization
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_dependencies():
    """Check if required dependencies are installed"""
    # Core packages always required
    required_packages = [
        'numpy', 'pyaudio', 'webrtcvad', 'ggwave', 'websockets'
    ]
    
    stt_mode = os.getenv('STT_MODE', 'whisper')
    tts_mode = os.getenv('TTS_MODE', 'coqui')

    if stt_mode == 'deepgram':
        required_packages.append('deepgram')
    else:
        required_packages += ['whisper', 'torch']

    if tts_mode == 'elevenlabs':
        required_packages.append('elevenlabs')
    else:
        required_packages += ['TTS', 'torch']
    
    missing_packages = []
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing_packages.append(package)
    
    if missing_packages:
        logger.error(f"Missing required packages: {missing_packages}")
        logger.info("Please install missing packages with:")
        logger.info(f"pip install {' '.join(missing_packages)}")
        return False
    
    return True

def setup_environment():
    """Setup environment variables and paths"""
    # STT / TTS backend selection
    if not os.getenv('STT_MODE'):
        os.environ['STT_MODE'] = 'whisper'
    if not os.getenv('TTS_MODE'):
        os.environ['TTS_MODE'] = 'coqui'

    # Set default models if not specified
    if not os.getenv('WHISPER_MODEL'):
        os.environ['WHISPER_MODEL'] = 'base'
    
    if not os.getenv('TTS_MODEL'):
        os.environ['TTS_MODEL'] = 'tts_models/en/jenny/jenny'
    
    if not os.getenv('WEBSOCKET_PORT'):
        os.environ['WEBSOCKET_PORT'] = '8765'
    
    # Warn if cloud keys are missing when cloud backends are requested
    if os.getenv('STT_MODE') == 'deepgram' and not os.getenv('DEEPGRAM_API_KEY'):
        logger.warning(
            "STT_MODE=deepgram but DEEPGRAM_API_KEY is not set. "
            "The service will fall back to Whisper."
        )
    if os.getenv('TTS_MODE') == 'elevenlabs' and not os.getenv('ELEVENLABS_API_KEY'):
        logger.warning(
            "TTS_MODE=elevenlabs but ELEVENLABS_API_KEY is not set. "
            "The service will fall back to Coqui."
        )

    # Set CUDA environment if available
    try:
        import torch
        if torch.cuda.is_available():
            logger.info(f"CUDA available with {torch.cuda.device_count()} device(s)")
            os.environ['CUDA_VISIBLE_DEVICES'] = '0'
        else:
            logger.info("CUDA not available, using CPU")
    except ImportError:
        logger.warning("PyTorch not available")

def main():
    """Main startup function"""
    logger.info("Starting Ally Speech Service...")
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Setup environment
    setup_environment()
    
    # Import and start the service
    try:
        from speech_service import main as service_main
        import asyncio
        asyncio.run(service_main())
    except ImportError as e:
        logger.error(f"Failed to import speech service: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Service failed to start: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()