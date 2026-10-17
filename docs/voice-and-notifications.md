# Voice and reply alerts

## Desktop

Settings → Voice selects Google Cloud or local speech for desktop and watch. Cloud settings (project, enabled, voice, desktop alerts) live in the main process's `speech-settings.json`; Google Application Default Credentials stay on the PC. Set the ADC quota project to the intended Google Cloud project and enable Speech-to-Text and Text-to-Speech. Never copy credentials to a watch or renderer.

Enable Voice to open the microphone. Words appear while speaking; a pause submits the finalized utterance. Local energy detection segments utterances, with 240 ms pre-roll, 700 ms silence and a 20-second cap. Google Chirp 3 streaming recognition receives 16 kHz mono PCM in the US multi-region using en-AU. Partials are previews, never messages. A failed stream sends the retained recording to the existing local Whisper worker. Turning voice off or changing chats cancels unfinished transcripts.

Replies speak sentence by sentence using Chirp 3 HD streaming PCM at 24 kHz. Audio starts as chunks arrive. Speak over playback or press Stop audio to interrupt. A failure before any audio falls back to Windows speech. A partially played failed stream is not replayed automatically. Google usage is billed to the selected project. No microphone recording is saved by Ally.

Reply notifications are enabled by default. They appear when Ally is unfocused, for completed desktop/watch requests and errors. Clicking opens the original chat. Windows notification settings and Do Not Disturb still apply. Closing Ally stops its work and notifications; it is not a cloud worker.

## Watch

Hold the orb, see live words, release to send. Swiping away or leaving the app while holding cancels recording. The limit is 60 seconds. Google credentials remain on the PC; the watch authenticates to Ally's existing HTTPS bridge. `/v1/speech/live` is a bounded authenticated WebSocket for microphone/audio transport only. It does not submit agent requests. On a live transcription failure, the complete recording falls back to the existing `/v1/audio` local transcription path.

Read aloud appears under assistant replies. Stop audio stops playback; starting a recording or switching chats also stops it. Settings → Auto-read can speak new replies while the app is visible. Auto-read defaults off. Cloud audio streams to AudioTrack; if no cloud audio arrived, Android TextToSpeech is the fallback. Watch speech requires an installed voice. Playback stops when Ally leaves the foreground.

Reply alerts default on and request Android's notification permission on the first updated launch. Settings can disable or enable them. An accepted turn starts a foreground data-sync monitor with an ongoing “Ally is working” notice. It checks only that turn, every three seconds, and stops on completion/error or after 15 minutes. Completion and actionable approval alerts are deduplicated and open the corresponding chat. No model requests are made by the monitor. It survives activity closure and can be restarted by Android if reclaimed; force-stop, revoked notification permission, OS restrictions, PC sleep and network loss can delay/prevent alerts. It is not FCM push and does not monitor arbitrary idle chats or proactive cards.

## Verification

`npm run build:electron`, then `node scripts/verify-google-speech.mjs` uses generated test audio to exercise both real cloud streams. It opens no microphone and sends no agent message. Unit tests cover cancellation, preview/final separation, fallback, audio bounds and duplicate notifications. Build/test the watch with `gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug`.

For a cloud-paired watch, install the APK directly with `adb install -r`. Do not run the development installer; it changes the endpoint back to localhost.
