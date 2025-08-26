#!/usr/bin/env python3
"""
Quick test script for Ally Speech Service
Tests basic functionality without full service startup
"""

import os
import sys
import tempfile
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_tts_only():
    """Test TTS functionality only"""
    try:
        logger.info("Testing TTS functionality...")
        
        # Import TTS
        from TTS.api import TTS
        import torch
        
        # Check device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        
        # Load model
        model_name = "tts_models/en/jenny/jenny"
        logger.info(f"Loading TTS model: {model_name}")
        
        tts = TTS(model_name, gpu=(device == "cuda"))
        
        # Generate test speech
        test_text = "Hello, this is a test of the TTS system."
        temp_file = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        temp_file.close()
        
        logger.info(f"Generating speech for: '{test_text}'")
        tts.tts_to_file(text=test_text, file_path=temp_file.name)
        
        # Check if file was created
        if os.path.exists(temp_file.name) and os.path.getsize(temp_file.name) > 0:
            logger.info(f"✅ TTS test successful! Audio file: {temp_file.name}")
            logger.info(f"File size: {os.path.getsize(temp_file.name)} bytes")
            
            # Clean up
            os.remove(temp_file.name)
            return True
        else:
            logger.error("❌ TTS test failed - no audio file generated")
            return False
            
    except Exception as e:
        logger.error(f"❌ TTS test failed: {e}")
        return False

def test_dependencies():
    """Test if all dependencies are available"""
    logger.info("Testing dependencies...")
    
    deps = {
        'numpy': 'numpy',
        'torch': 'torch', 
        'TTS': 'TTS',
        'websockets': 'websockets',
        'whisper': 'whisper',
        'ggwave': 'ggwave',
        'pyaudio': 'pyaudio',
        'webrtcvad': 'webrtcvad'
    }
    
    missing = []
    for name, module in deps.items():
        try:
            __import__(module)
            logger.info(f"✅ {name} - OK")
        except ImportError:
            logger.error(f"❌ {name} - MISSING")
            missing.append(name)
    
    if missing:
        logger.error(f"Missing dependencies: {missing}")
        logger.info("Install with: pip install " + " ".join(missing))
        return False
    
    return True

def main():
    """Main test function"""
    logger.info("=== Ally Speech Service Quick Test ===")
    
    # Test dependencies
    if not test_dependencies():
        sys.exit(1)
    
    # Test TTS
    if not test_tts_only():
        sys.exit(1)
    
    logger.info("🎉 All tests passed! Speech service should work correctly.")

if __name__ == "__main__":
    main()