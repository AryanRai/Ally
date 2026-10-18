import io
import json
import threading
import unittest
import urllib.error
import urllib.request
import wave
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, Mock

from transcriber import MAX_AUDIO, SpeechEngine, speech_cache, create_server, decode_wav


class ModelCacheTests(unittest.TestCase):
    def test_uses_owned_local_cache_without_touching_a_broken_shared_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"LOCALAPPDATA": directory, "HF_HOME": "Z:/unavailable/huggingface"}, clear=True):
                constructor = Mock(return_value=object())
                with patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=constructor)}):
                    engine = SpeechEngine()
                    engine.load()
                expected = Path(directory) / "Ally" / "speech" / "models"
                self.assertTrue(expected.is_dir())
                self.assertEqual(constructor.call_args.kwargs["download_root"], str(expected))
                self.assertEqual(os.environ["HF_XET_CACHE"], str(expected.parent / "xet"))
                self.assertTrue(engine.health()["ready"])
                self.assertEqual(os.environ["HF_HOME"], "Z:/unavailable/huggingface")

    def test_honours_explicit_cache_and_redacts_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"ALLY_STT_CACHE": directory, "HF_XET_CACHE": directory}, clear=True):
                self.assertEqual(speech_cache(), directory)
                constructor = Mock(side_effect=FileNotFoundError("private/path?token=secret"))
                with patch.dict(sys.modules, {"faster_whisper": SimpleNamespace(WhisperModel=constructor)}):
                    engine = SpeechEngine()
                    engine.load()
                    self.assertFalse(engine.health()["ready"])
                    self.assertNotIn("secret", engine.health()["error"])
                    constructor.side_effect = None
                    engine.load()
                    self.assertTrue(engine.health()["ready"])
                    self.assertNotIn("error", engine.health())


def wav_data(samples=b"\x00\x10" * 6400, rate=16000):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples)
    return output.getvalue()


class FakeEngine:
    state = "ready"
    def __init__(self):
        self.lock = threading.Lock()
        self.calls = 0
    def health(self):
        return {"service": "ally-speech", "version": 1, "ready": self.state == "ready", "state": self.state}
    def transcribe(self, data):
        decode_wav(data)
        self.calls += 1
        return {"text": "Test transcript"}


class AudioTests(unittest.TestCase):
    def test_decodes_signed_pcm(self):
        pcm = decode_wav(wav_data(b"\x00\x80" * 6400))
        self.assertEqual(len(pcm), 6400)
        self.assertEqual(float(pcm[0]), -1)

    def test_rejects_silence_wrong_rate_and_truncated_audio(self):
        for data in [wav_data(b"\0\0" * 6400), wav_data(rate=48000), wav_data()[:-20], b"junk", b"x" * (MAX_AUDIO + 1)]:
            with self.subTest(size=len(data)), self.assertRaises(ValueError):
                decode_wav(data)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.token = "test-only-token-" * 3
        self.engine = FakeEngine()
        self.server = create_server(self.token, self.engine, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, body=None, headers=None):
        options = {"Authorization": "Bearer " + self.token, "Content-Type": "audio/wav"}
        options.update(headers or {})
        request = urllib.request.Request(self.url + path, data=body, headers=options)
        # Ignore host-machine proxies for explicit loopback tests.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            response = opener.open(request, timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_authentication_and_origin_guard_before_inference(self):
        for headers in [{"Authorization": "wrong"}, {"Origin": "https://example.com"}]:
            self.assertEqual(self.request("/transcribe", wav_data(), headers)[0], 401)
        self.assertEqual(self.request("/health", headers={"Authorization": "wrong"})[0], 401)
        self.assertEqual(self.engine.calls, 0)

    def test_reports_warming_model_and_rejects_audio_until_ready(self):
        self.engine.state = "loading"
        code, status = self.request("/health")
        self.assertEqual(code, 200)
        self.assertFalse(status["ready"])
        self.assertEqual(self.request("/transcribe", wav_data())[0], 503)

    def test_busy_and_invalid_body_release_lock_for_next_recording(self):
        self.engine.lock.acquire()
        self.assertEqual(self.request("/transcribe", wav_data())[0], 429)
        self.engine.lock.release()
        self.assertEqual(self.request("/transcribe", wav_data(rate=8000))[0], 422)
        code, result = self.request("/transcribe", wav_data())
        self.assertEqual((code, result["text"]), (200, "Test transcript"))

    def test_bounds_and_content_type(self):
        self.assertEqual(self.request("/transcribe", b"x")[0], 413)
        self.assertEqual(self.request("/transcribe", wav_data(), {"Content-Type": "application/json"})[0], 415)


if __name__ == "__main__":
    unittest.main()
