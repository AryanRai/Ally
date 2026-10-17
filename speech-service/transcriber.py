"""Shared local STT for Ally desktop and Wear OS. Never opens a microphone."""
import argparse
import hmac
import io
import json
import os
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_AUDIO = 1_920_044  # Exactly 60 seconds, 16 kHz signed 16-bit mono + WAV header.


def decode_wav(data):
    import numpy as np
    if not 6444 <= len(data) <= MAX_AUDIO:
        raise ValueError("Record between 0.2 and 60 seconds")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth(), audio.getcomptype()) != (16000, 1, 2, "NONE"):
                raise ValueError("Expected 16 kHz mono 16-bit PCM WAV")
            frames = audio.getnframes()
            if not 3200 <= frames <= 960000:
                raise ValueError("Record between 0.2 and 60 seconds")
            raw = audio.readframes(frames)
            if len(raw) != frames * 2:
                raise ValueError("Incomplete recording; please try again")
    except (wave.Error, EOFError) as error:
        raise ValueError("Invalid WAV recording") from error
    pcm = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if float(np.sqrt(np.mean(pcm * pcm))) < 0.0006:
        raise ValueError("No speech heard. Please try again.")
    return pcm


class SpeechEngine:
    def __init__(self, model="small", device="cpu", compute_type="int8"):
        self.model_name = model
        self.device = device
        self.compute_type = compute_type
        self.model = None
        self.state = "loading"
        self.error = None
        self.lock = threading.Lock()

    def load(self):
        try:
            # Public models need no account token; avoid sending unrelated cached HF credentials.
            os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
            from faster_whisper import WhisperModel
            self.model = WhisperModel(self.model_name, device=self.device, compute_type=self.compute_type,
                                      cpu_threads=min(6, os.cpu_count() or 2), num_workers=1)
            self.state = "ready"
        except Exception as error:
            # Report the category without leaking credentials, cache paths or signed download URLs.
            self.error = f"Speech model could not load ({type(error).__name__}). Check model files and the speech environment."
            self.state = "error"

    def health(self):
        return {"service": "ally-speech", "version": 1, "ready": self.state == "ready", "state": self.state,
                "backend": "faster-whisper", "model": self.model_name, "device": self.device,
                **({"error": self.error} if self.error else {})}

    def transcribe(self, data):
        pcm = decode_wav(data)
        started = time.monotonic()
        segments, info = self.model.transcribe(pcm, beam_size=3, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400}, condition_on_previous_text=False)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        if not text:
            raise ValueError("No speech heard. Please try again.")
        return {"text": text[:12000], "language": info.language, "durationSeconds": len(pcm) / 16000,
                "elapsedMs": round((time.monotonic() - started) * 1000)}


def create_server(token, engine, port=18766):
    if not isinstance(token, str) or len(token) < 32:
        raise ValueError("A valid pairing token is required")

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, value):
            # Windows resets sockets closed with unread upload bytes. Drain only a bounded,
            # declared body so clients receive actionable auth/loading/busy errors.
            if self.command == "POST" and not getattr(self, "body_read", False):
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                    if 0 < size <= MAX_AUDIO and not self.headers.get("Transfer-Encoding"):
                        self.connection.settimeout(3)
                        self.rfile.read(size)
                except (ValueError, OSError):
                    pass
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def authorized(self):
            if self.headers.get("Origin") or not hmac.compare_digest(
                    self.headers.get("Authorization", "").encode(), ("Bearer " + token).encode()):
                self.reply(401, {"error": "Unauthorized"})
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            if self.path != "/health":
                return self.reply(404, {"error": "Not found"})
            self.reply(200, engine.health())

        def do_POST(self):
            if not self.authorized():
                return
            if self.path != "/transcribe":
                return self.reply(404, {"error": "Not found"})
            if self.headers.get("Transfer-Encoding") or self.headers.get_content_type() != "audio/wav":
                return self.reply(415, {"error": "Send a bounded audio/wav body"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reply(400, {"error": "Invalid recording length"})
            if not 6444 <= size <= MAX_AUDIO:
                return self.reply(413, {"error": "Record between 0.2 and 60 seconds"})
            if not engine.health()["ready"]:
                return self.reply(503, {"error": "Voice is getting ready. Try again shortly.", "state": engine.state})
            if not engine.lock.acquire(blocking=False):
                return self.reply(429, {"error": "Voice is processing another recording. Try again shortly."})
            try:
                self.connection.settimeout(15)
                data = self.rfile.read(size)
                self.body_read = True
                if len(data) != size:
                    raise ValueError("Incomplete recording; please try again")
                self.reply(200, engine.transcribe(data))
            except ValueError as error:
                self.reply(422, {"error": str(error)})
            except TimeoutError:
                self.reply(408, {"error": "Recording upload timed out"})
            except Exception:
                self.reply(500, {"error": "Transcription failed. Please try again."})
            finally:
                engine.lock.release()

        def log_message(self, *_):
            pass  # No audio, transcripts, tokens or request bodies in logs.

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Ally userData/watch-bridge.json")
    parser.add_argument("--model", default=os.environ.get("ALLY_STT_MODEL", "small"))
    parser.add_argument("--device", default=os.environ.get("ALLY_STT_DEVICE", "cpu"), choices=["cpu", "cuda", "auto"])
    parser.add_argument("--compute-type", default=os.environ.get("ALLY_STT_COMPUTE_TYPE", "int8"))
    args = parser.parse_args()
    with open(args.config, encoding="utf-8-sig") as source:
        token = json.load(source)["token"]
    engine = SpeechEngine(args.model, args.device, args.compute_type)
    server = create_server(token, engine)
    threading.Thread(target=engine.load, daemon=True).start()
    print("Ally shared speech worker listening on 127.0.0.1:18766; model loading", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
