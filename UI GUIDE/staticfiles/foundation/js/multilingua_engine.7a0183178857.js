/**
 * WDOS Stage 10 — Multilingua Meeting & Translation Engine
 * Orchestrates Zoom Video SDK (WebRTC Media) & Azure AI Speech (Live Translation & Neural TTS)
 * with graceful fallback when running in local/offline or caption-only degraded mode.
 */

class WDOSMultilinguaMeeting {
    constructor(config) {
        this.meetingId = config.meetingId;
        this.tokensUrl = config.tokensUrl;
        this.transcriptUrl = config.transcriptUrl || `/api/rooms/${config.meetingId}/transcript/`;
        this.restoreAudioUrl = config.restoreAudioUrl || `/api/rooms/${config.meetingId}/restore-audio/`;
        this.userDisplayName = config.userDisplayName || "Ada Okafor";

        // Language State
        this.speakingLang = config.speakingLang || "en-US";
        this.listeningLang = config.listeningLang || "fr-FR";

        // Provider Clients
        this.zoomClient = null;
        this.mediaStream = null;
        this.speechRecognizer = null;
        this.speechSynthesizer = null;

        // Media & Degraded Fallback Flags
        this.isAudioMuted = true;
        this.isVideoOff = true;
        this.isTranslatedAudioEnabled = true;
        this.isAudioDegraded = false;
    }

    async initializeRoom() {
        try {
            const response = await fetch(this.tokensUrl, {
                headers: { "Accept": "application/json" }
            });
            const data = await response.json();

            if (response.status === 403 && data.status === "waiting") {
                this.triggerWaitingRoomUI();
                return data;
            }

            if (!response.ok) {
                throw new Error(data.error || "Failed to initialize room tokens.");
            }

            await this.initZoomMedia(data.zoom);
            await this.initAzureTranslation(data.azure);
            this.updateDiagnosticsUI("Connected", 34);
            return data;
        } catch (err) {
            console.warn("[WDOS Multilingua] Operating in degraded caption fallback:", err);
            this.triggerDegradedModeUI(err.message);
            return null;
        }
    }

    async initZoomMedia(zoomData) {
        if (!window.ZoomVideo) {
            console.info("[WDOS Multilingua] Zoom Video SDK running in local preview mode.");
            return;
        }
        this.zoomClient = window.ZoomVideo.createClient();
        await this.zoomClient.init("en-US", "Global", { patchJsMedia: true });
        await this.zoomClient.join(
            zoomData.session_name,
            zoomData.token,
            this.userDisplayName
        );
        this.mediaStream = this.zoomClient.getMediaStream();
        await this.mediaStream.startAudio({ mute: true });
    }

    async initAzureTranslation(azureData) {
        if (!window.SpeechSDK) {
            console.info("[WDOS Multilingua] Azure Speech SDK running in local caption stream mode.");
            return;
        }
        const speechConfig = window.SpeechSDK.SpeechTranslationConfig.fromAuthorizationToken(
            azureData.token,
            azureData.region
        );
        speechConfig.speechRecognitionLanguage = this.speakingLang;

        Object.values(azureData.supported_languages || {}).forEach((lang) => {
            speechConfig.addTargetLanguage(lang.short);
        });

        const audioConfig = window.SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
        this.speechRecognizer = new window.SpeechSDK.TranslationRecognizer(speechConfig, audioConfig);

        this.speechRecognizer.recognizing = (s, e) => {
            const targetShort = this.listeningLang.split("-")[0];
            const translatedText = e.result.translations.get(targetShort) || e.result.text;
            this.renderLiveCaption(this.userDisplayName, translatedText, false);
        };

        this.speechRecognizer.recognized = (s, e) => {
            if (e.result.reason === window.SpeechSDK.ResultReason.TranslatedSpeech) {
                const targetShort = this.listeningLang.split("-")[0];
                const finalTranslation = e.result.translations.get(targetShort) || e.result.text;
                this.renderLiveCaption(this.userDisplayName, finalTranslation, true);

                if (this.isTranslatedAudioEnabled && this.listeningLang !== this.speakingLang) {
                    this.speakTranslation(finalTranslation, azureData);
                }
                this.postTranscriptSegment(e.result.text, finalTranslation, targetShort);
            }
        };
    }

    speakTranslation(text, azureData) {
        if (!text || !window.SpeechSDK) return;
        try {
            const ttsConfig = window.SpeechSDK.SpeechConfig.fromAuthorizationToken(
                azureData.token,
                azureData.region
            );
            const voiceMeta = (azureData.supported_languages || {})[this.listeningLang];
            ttsConfig.speechSynthesisVoiceName = voiceMeta ? voiceMeta.voice : "fr-FR-DeniseNeural";
            const synthesizer = new window.SpeechSDK.SpeechSynthesizer(ttsConfig);
            synthesizer.speakTextAsync(
                text,
                () => synthesizer.close(),
                () => {
                    synthesizer.close();
                    this.triggerDegradedModeUI("Translated voice is unavailable right now. Captions remain available as a degraded fallback.");
                }
            );
        } catch (err) {
            this.triggerDegradedModeUI(err.message);
        }
    }

    async postTranscriptSegment(originalText, translatedText, targetShort) {
        if (!this.transcriptUrl || !originalText) return;
        try {
            const translations = {};
            if (targetShort && translatedText) {
                translations[targetShort] = translatedText;
            }
            await fetch(this.transcriptUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": this.getCsrfToken()
                },
                body: JSON.stringify({
                    speaker_name: this.userDisplayName,
                    original_language: this.speakingLang,
                    original_text: originalText,
                    translations: translations
                })
            });
        } catch (err) {
            console.warn("[WDOS Multilingua] Transcript sync warning:", err);
        }
    }

    async toggleMicrophone() {
        if (this.isAudioMuted) {
            if (this.mediaStream) await this.mediaStream.unmuteAudio();
            if (this.speechRecognizer) this.speechRecognizer.startContinuousRecognitionAsync();
            this.isAudioMuted = false;
        } else {
            if (this.mediaStream) await this.mediaStream.muteAudio();
            if (this.speechRecognizer) this.speechRecognizer.stopContinuousRecognitionAsync();
            this.isAudioMuted = true;
        }
        return !this.isAudioMuted;
    }

    switchListeningLanguage(newLangCode) {
        this.listeningLang = newLangCode;
        const badgeEl = document.getElementById("active-listening-lang-badge");
        if (badgeEl) badgeEl.textContent = newLangCode;
    }

    async restoreAudio() {
        try {
            if (this.mediaStream) {
                await this.mediaStream.stopAudio();
                await this.mediaStream.startAudio({ mute: this.isAudioMuted });
            }
            const resp = await fetch(this.restoreAudioUrl, {
                method: "POST",
                headers: { "X-CSRFToken": this.getCsrfToken() }
            });
            this.isAudioDegraded = false;
            const alertEl = document.getElementById("room-degraded-banner");
            if (alertEl) alertEl.style.display = "none";
            return await resp.json();
        } catch (err) {
            console.error("Audio recovery failed:", err);
            return null;
        }
    }

    renderLiveCaption(speaker, text, isFinal) {
        const container = document.getElementById("caption-container");
        const speakerEl = document.getElementById("caption-speaker");
        const textEl = document.getElementById("caption-text");
        if (!container || !speakerEl || !textEl) return;

        speakerEl.textContent = `${speaker}:`;
        textEl.textContent = text;
        container.style.opacity = isFinal ? "1.0" : "0.88";
    }

    triggerWaitingRoomUI() {
        if (window.location.pathname.indexOf("/waiting/") === -1 && this.meetingId) {
            window.location.href = `/foundation/rooms/${this.meetingId}/waiting/`;
        }
    }

    triggerDegradedModeUI(reason) {
        this.isAudioDegraded = true;
        const alertEl = document.getElementById("room-degraded-banner");
        if (alertEl) {
            alertEl.style.display = "flex";
            const msgEl = alertEl.querySelector(".degraded-reason");
            if (msgEl && reason) msgEl.textContent = reason;
        }
    }

    updateDiagnosticsUI(stateLabel, latencyMs) {
        const latEl = document.getElementById("diag-latency-ms");
        if (latEl) latEl.textContent = `${latencyMs} ms`;
    }

    getCsrfToken() {
        const input = document.querySelector("input[name='csrfmiddlewaretoken']");
        if (input) return input.value;
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : "";
    }
}

window.WDOSMultilinguaMeeting = WDOSMultilinguaMeeting;
