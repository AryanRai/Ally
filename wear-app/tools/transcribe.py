"""Compatibility launcher for Ally's shared desktop/watch speech worker."""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parents[2] / "speech-service" / "transcriber.py"), run_name="__main__")
