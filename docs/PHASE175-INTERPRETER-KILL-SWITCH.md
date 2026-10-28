# PHASE 175 - HQ interpreter kill switch (for the Saturday meeting)
Build v80.1 · db 135 (no new migration — reuses org_settings) · 10 Sep 2026

## What it does
Settings → Multilingua interpreter: one toggle, org_settings key
`interpreter_enabled` (default true / on). Applies to every meeting room at
once, immediately for anyone opening the room from then on; anyone already in
a call sees the change after reloading.

When switched OFF, in every room:
- The "Tap to speak" button is disabled (greyed, unclickable) and relabelled
  "Interpreter off"; toggleSpeak() itself refuses to run even if called
  another way, so nothing about it can start a capture or touch the call's
  microphone.
- "I want to hear [language]" and the voice-test button disappear.
- The engine/translate/voice status chips disappear (nothing to report).
- A plain banner replaces them: "Human interpretation in use for this
  meeting — speak normally in English; a human interpreter on the call will
  translate for listeners. Use Jitsi's own microphone button to mute or
  unmute yourself."
- The embedded Jitsi call itself, and everyone's own mute button inside it,
  is completely untouched — WDOS makes no mute decision at any point while
  the switch is off.

When switched back ON, every room returns to exactly the interpreter
behaviour already deployed (v78–v79): auto-detected spoken language,
per-listener translation, the noise/hallucination guards, all unchanged.

## For Saturday
Settings → Multilingua interpreter → untick "Automatic interpreter enabled"
→ Save, before the meeting. Everyone speaks English; your human interpreter
speaks over the same Jitsi call for whichever listeners need it. Switch it
back on afterwards the same way.

## Deploy
App only. Drag `app` (v80.1) → badge v80.1 · db 135.
