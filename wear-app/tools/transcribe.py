"""Local Whisper worker for Ally watch uploads. Does not open the PC microphone."""
import argparse
import hmac
import io
import json
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import whisper


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Ally userData/watch-bridge.json")
    parser.add_argument("--model", default="base")
    args = parser.parse_args()
    with open(args.config, encoding="utf-8") as source:
        token = json.load(source)["token"]
    model = whisper.load_model(args.model)
    lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, value):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.reply(200 if self.path == "/health" else 404, {"ready": True})

        def do_POST(self):
            if self.path != "/transcribe":
                return self.reply(404, {"error": "Not found"})
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                return self.reply(401, {"error": "Unauthorized"})
            size = int(self.headers.get("Content-Length", "0"))
            if not 6444 <= size <= 2_000_044:
                return self.reply(413, {"error": "Invalid recording length"})
            if not lock.acquire(blocking=False):
                return self.reply(429, {"error": "Transcriber busy. Try again."})
            try:
                self.connection.settimeout(15)
                data = self.rfile.read(size)
                with wave.open(io.BytesIO(data), "rb") as wav:
                    if wav.getframerate() != 16000 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
                        raise ValueError("Expected 16 kHz mono PCM")
                    pcm = np.frombuffer(wav.readframes(wav.getnframes()), np.int16).astype(np.float32) / 32768.0
                if len(pcm) < 3200 or float(np.sqrt(np.mean(pcm * pcm))) < 0.002:
                    return self.reply(400, {"error": "No speech heard. Please try again."})
                result = model.transcribe(pcm, fp16=False)
                self.reply(200, {"text": result["text"].strip()})
            except Exception as error:
                self.reply(400, {"error": str(error)})
            finally:
                lock.release()

        def log_message(self, *_):
            pass  # Never log recordings or transcripts.

    print("Ally voice worker ready on localhost:18766", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 18766), Handler).serve_forever()


if __name__ == "__main__":
    main()
