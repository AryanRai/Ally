# Phone speech model cache repair

The supplied Android assistant screenshot shows `Speech model could not load (FileNotFoundError)` below a retained draft. This message originates from the shared desktop faster-whisper worker, not Android's microphone permission or assistant role. USB discovery verified Pixel 7 serial2C181FDH2000W3, connected Ally phone2c657c4c-bf98-4bf4-b0a0-cb11fb62d595.

Reproducing model construction identified the missing path: C:/Users/buzza/.cache/huggingface is a junction to D:/huggingface, and D: is unavailable. Whisper's model download failed creating that cache. Specifying only download_root also left Hugging Face's independent Xet transfer cache following the same broken junction.

The local worker now uses an Ally-owned model cache under %LOCALAPPDATA%/Ally/speech/models and a neighbouring Xet transfer cache. ALLY_STT_CACHE and explicit HF_XET_CACHE overrides are honoured, as is the original ALLY_STT_MODEL selection. No shared junction, global Python packages, credentials, security settings or existing model files were changed/deleted. Raw path/credential details remain absent from device error messages.

Downloaded and loaded the existing small CPU/int8 model successfully. All eight worker tests pass, including new isolated-cache, explicit-override, redaction and retry-health regressions. Only the exact already-failed speech child42680 and launcher27556 were stopped after checking parent52740, command paths, port ownership and error health. A generated silent PCM WAV through the authenticated bridge triggered Ally's normal managed worker startup and was rejected as No speech heard before inference; this endpoint never creates a chat turn. No microphone, private audio, real transcription/model-agent prompt or screenshot capture was used.

Replacement worker2708/launcher17096 is managed by unchanged Ally52740. Local and cloud /v1/status both report connected=true, voiceAvailable=true, voiceState=ready and Hold to talk. The paired phone is still connected. Desktop chat turns, data, pairing, drafts, assistant role and power mapping were not restarted/modified. No APK or watch installation was necessary.

Initial read-only on-phone UI inspection expired with zero operations; no approval remained pending and no alternate UI access bypassed it. The user then explicitly requested another real phone approval prompt, so a new read-only inspection was submitted. Its result must be recorded separately; service readiness alone is not a claim of physical speech recording or phone-overlay verification.
