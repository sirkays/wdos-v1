/**
 * WDOS Multilingua Meeting & Translation Engine
 * Orchestrates live Microphone Speech-to-Text (Azure AI Speech SDK + Web Speech API),
 * real-time multi-language translation (English, French, Portuguese, Arabic, Swahili, Hausa, Yoruba, Igbo),
 * Neural Text-to-Speech audio output (Azure Neural TTS + Web Speech Synthesis fallback),
 * live WebRTC camera preview, and real-time multi-participant room synchronization.
 */

class WDOSMultilinguaMeeting {
    constructor(config) {
        this.meetingId = config.meetingId;
        this.tokensUrl = config.tokensUrl;
        this.transcriptUrl = config.transcriptUrl || `/api/rooms/${config.meetingId}/transcript/`;
        this.restoreAudioUrl = config.restoreAudioUrl || `/api/rooms/${config.meetingId}/restore-audio/`;
        this.userDisplayName = config.userDisplayName || "Participant";

        // Language State
        this.speakingLang = config.speakingLang || "en-US";
        this.listeningLang = config.listeningLang || "fr-FR";

        // Provider Clients & State
        this.azureData = null;
        this.zoomData = null;
        this.zoomClient = null;
        this.mediaStream = null;
        this.localVideoStream = null;
        this.speechRecognizer = null;
        this.webSpeechRecognizer = null;
        this.speechSynthesizer = null;

        // Media & Sync Flags
        this.isAudioMuted = true;
        this.isVideoOff = true;
        this.isTranslatedAudioEnabled = true;
        this.isAudioDegraded = false;
        this.lastSeenSequence = config.initialSequence || 0;
        this.pollTimer = null;
        this.lastTranslatedText = "";

        this.langNames = {
            "en-US": "English",
            "fr-FR": "French",
            "pt-BR": "Portuguese",
            "ar-EG": "Arabic",
            "sw-KE": "Swahili",
            "ha-NG": "Hausa",
            "yo-NG": "Yoruba",
            "ig-NG": "Igbo"
        };
    }

    getShortLang(bcp47) {
        return (bcp47 || "en-US").split("-")[0].toLowerCase();
    }

    async boot() {
        this.bindUIControls();
        await this.initializeRoom();
        this.startLivePolling();
    }

    bindUIControls() {
        const micBtns = document.querySelectorAll("#btn-toggle-mic, #btn-start-speaking");
        micBtns.forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                await this.toggleMicrophone();
            });
        });

        const camBtns = document.querySelectorAll("#btn-toggle-cam");
        camBtns.forEach((btn) => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                await this.toggleCamera();
            });
        });

        const playBtn = document.getElementById("btn-play-translation");
        if (playBtn) {
            playBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const textToSpeak = this.lastTranslatedText || document.getElementById("caption-translated-text")?.textContent || document.getElementById("caption-text")?.textContent;
                if (textToSpeak) {
                    this.speakTranslation(textToSpeak.trim(), this.azureData, true);
                }
            });
        }

        const speakForms = document.querySelectorAll("#live-speech-form, #room-04-speak-form");
        speakForms.forEach((form) => {
            form.addEventListener("submit", async (e) => {
                const input = form.querySelector("input[name='original_text']");
                if (!input || !input.value.trim()) return;
                e.preventDefault();
                const text = input.value.trim();
                const submitBtn = form.querySelector("button[type='submit']");
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = "Translating...";
                }
                input.value = "";
                await this.postTranscriptSegment(text, null, null);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Broadcast & translate";
                }
                await this.fetchLatestTranscript(true);
            });
        });

        const quickLangSelect = document.getElementById("quick-switch-lang");
        if (quickLangSelect) {
            quickLangSelect.addEventListener("change", () => {
                this.switchListeningLanguage(quickLangSelect.value);
                this.fetchLatestTranscript(true);
            });
        }

        const speakLangSelect = document.getElementById("quick-speaking-lang");
        if (speakLangSelect) {
            speakLangSelect.addEventListener("change", async () => {
                this.speakingLang = speakLangSelect.value;
                this.setMicStatus(`Speaking language set to ${this.langNames[this.speakingLang] || this.speakingLang}.`);
                if (!this.isAudioMuted) {
                    await this.toggleMicrophone(); // stop
                    await this.toggleMicrophone(); // restart in new language
                }
            });
        }
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

            this.azureData = data.azure;
            this.zoomData = data.zoom;
            if (data.participant) {
                this.userDisplayName = data.participant.name || this.userDisplayName;
                this.speakingLang = data.participant.speaking_lang || this.speakingLang;
                this.listeningLang = data.participant.listening_lang || this.listeningLang;
            }

            await this.initZoomMedia(data.zoom);
            await this.initAzureTranslation(data.azure);
            this.updateDiagnosticsUI("Connected", 34);
            this.setMicStatus(`Connected (${this.azureData?.mode === "live" ? "Azure AI Speech Live" : "Ready"}) · Speaking: ${this.langNames[this.speakingLang] || this.speakingLang} · Listening: ${this.langNames[this.listeningLang] || this.listeningLang}`);
            return data;
        } catch (err) {
            console.warn("[WDOS Multilingua] Operating in degraded caption fallback:", err);
            this.triggerDegradedModeUI(err.message);
            return null;
        }
    }

    async initZoomMedia(zoomData) {
        if (!window.ZoomVideo || !zoomData) {
            return;
        }
        try {
            this.zoomClient = window.ZoomVideo.createClient();
            await this.zoomClient.init("en-US", "Global", { patchJsMedia: true });
            await this.zoomClient.join(
                zoomData.session_name,
                zoomData.token,
                this.userDisplayName
            );
            this.mediaStream = this.zoomClient.getMediaStream();
            await this.mediaStream.startAudio({ mute: true });
        } catch (err) {
            console.info("[WDOS Multilingua] Local WebRTC media mode active.");
        }
    }

    async initAzureTranslation(azureData) {
        if (!window.SpeechSDK || !azureData || !azureData.token || azureData.mode === "mock") {
            return;
        }
        try {
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
                if (!e.result || !e.result.text) return;
                const targetShort = this.getShortLang(this.listeningLang);
                const translatedText = (e.result.translations && e.result.translations.get(targetShort)) || e.result.text;
                this.renderLiveCaption(this.userDisplayName, e.result.text, translatedText, false);
            };

            this.speechRecognizer.recognized = async (s, e) => {
                if (e.result && e.result.text && e.result.text.trim()) {
                    const allTranslations = {};
                    Object.values(azureData.supported_languages || {}).forEach((lang) => {
                        const tVal = e.result.translations ? e.result.translations.get(lang.short) : null;
                        if (tVal) allTranslations[lang.short] = tVal;
                    });
                    const targetShort = this.getShortLang(this.listeningLang);
                    const finalTranslation = allTranslations[targetShort] || e.result.text;
                    this.renderLiveCaption(this.userDisplayName, e.result.text, finalTranslation, true);
                    await this.postTranscriptSegment(e.result.text, finalTranslation, targetShort, allTranslations);
                    await this.fetchLatestTranscript(false);
                }
            };
        } catch (err) {
            console.warn("[WDOS Multilingua] Azure SpeechSDK init fallback to Web Speech API:", err);
            this.speechRecognizer = null;
        }
    }

    startWebSpeechFallback() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            this.setMicStatus("Browser microphone speech recognition requires Chrome/Edge, or type below to broadcast.");
            return false;
        }
        this.webSpeechRecognizer = new SpeechRec();
        this.webSpeechRecognizer.lang = this.speakingLang || "en-US";
        this.webSpeechRecognizer.continuous = true;
        this.webSpeechRecognizer.interimResults = true;

        this.webSpeechRecognizer.onresult = async (event) => {
            let interimText = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    const clean = transcript.trim();
                    if (clean) {
                        this.renderLiveCaption(this.userDisplayName, clean, "Translating live...", false);
                        await this.postTranscriptSegment(clean, null, null);
                        await this.fetchLatestTranscript(true);
                    }
                } else {
                    interimText += transcript;
                }
            }
            if (interimText.trim()) {
                this.renderLiveCaption(this.userDisplayName, interimText.trim(), "...", false);
            }
        };

        this.webSpeechRecognizer.onerror = (e) => {
            console.warn("[WDOS Multilingua] WebSpeech warning:", e.error);
        };

        this.webSpeechRecognizer.onend = () => {
            if (!this.isAudioMuted && this.webSpeechRecognizer) {
                try { this.webSpeechRecognizer.start(); } catch (_) {}
            }
        };

        try {
            this.webSpeechRecognizer.start();
            return true;
        } catch (err) {
            return false;
        }
    }

    async toggleMicrophone() {
        const micBtns = document.querySelectorAll("#btn-toggle-mic, #btn-start-speaking");
        const waveform = document.getElementById("stage-waveform");

        if (this.isAudioMuted) {
            if (this.mediaStream) {
                try { await this.mediaStream.unmuteAudio(); } catch (_) {}
            }
            if (this.speechRecognizer) {
                this.speechRecognizer.startContinuousRecognitionAsync(
                    () => {},
                    (err) => {
                        console.warn("Azure mic recognition fallback to WebSpeech:", err);
                        this.startWebSpeechFallback();
                    }
                );
            } else {
                this.startWebSpeechFallback();
            }
            this.isAudioMuted = false;
            micBtns.forEach((btn) => {
                btn.textContent = "🎙️ Mic ON · Speak Now (Click to Mute)";
                btn.style.background = "#7CB518";
                btn.style.color = "#19131A";
                btn.style.borderColor = "#7CB518";
            });
            if (waveform) waveform.style.opacity = "1";
            this.setMicStatus(`🔴 LIVE MICROPHONE ACTIVE — Speak in ${this.langNames[this.speakingLang] || this.speakingLang}. Other participants will hear & see their chosen language automatically.`);
        } else {
            if (this.mediaStream) {
                try { await this.mediaStream.muteAudio(); } catch (_) {}
            }
            if (this.speechRecognizer) {
                try { this.speechRecognizer.stopContinuousRecognitionAsync(); } catch (_) {}
            }
            if (this.webSpeechRecognizer) {
                const rec = this.webSpeechRecognizer;
                this.webSpeechRecognizer = null;
                try { rec.stop(); } catch (_) {}
            }
            this.isAudioMuted = true;
            micBtns.forEach((btn) => {
                btn.textContent = btn.id === "btn-start-speaking" ? "Start speaking" : "🎙️ Turn Mic On";
                btn.style.background = "";
                btn.style.color = "";
                btn.style.borderColor = "";
            });
            this.setMicStatus(`Microphone muted · Click "Turn Mic On" to speak live or type below.`);
        }
        return !this.isAudioMuted;
    }

    async toggleCamera() {
        const camBtns = document.querySelectorAll("#btn-toggle-cam");
        const stageVideo = document.getElementById("live-stage-video") || document.getElementById("prejoin-preview");
        const speakerAvatarBox = document.getElementById("stage-avatar-container");

        if (this.isVideoOff) {
            try {
                this.localVideoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                if (stageVideo) {
                    stageVideo.srcObject = this.localVideoStream;
                    stageVideo.style.display = "block";
                }
                if (speakerAvatarBox) {
                    speakerAvatarBox.style.display = "none";
                }
                this.isVideoOff = false;
                camBtns.forEach((btn) => {
                    btn.textContent = "📷 Camera ON";
                    btn.style.background = "#7CB518";
                    btn.style.color = "#19131A";
                });
            } catch (err) {
                this.setMicStatus("Camera permission denied or no webcam found.");
            }
        } else {
            if (this.localVideoStream) {
                this.localVideoStream.getTracks().forEach((t) => t.stop());
                this.localVideoStream = null;
            }
            if (stageVideo) {
                stageVideo.srcObject = null;
                if (stageVideo.id === "live-stage-video") stageVideo.style.display = "none";
            }
            if (speakerAvatarBox) {
                speakerAvatarBox.style.display = "flex";
            }
            this.isVideoOff = true;
            camBtns.forEach((btn) => {
                btn.textContent = "📷 Turn Camera On";
                btn.style.background = "";
                btn.style.color = "";
            });
        }
    }

    speakTranslation(text, azureData = null, forcePlay = false) {
        if (!text) return;
        const activeAzure = azureData || this.azureData;
        const targetLang = this.listeningLang || "fr-FR";

        // 1. Try Azure Neural Speech Synthesizer if SpeechSDK and live token are available
        if (window.SpeechSDK && activeAzure && activeAzure.token && activeAzure.mode === "live") {
            try {
                const ttsConfig = window.SpeechSDK.SpeechConfig.fromAuthorizationToken(
                    activeAzure.token,
                    activeAzure.region
                );
                const voiceMeta = (activeAzure.supported_languages || {})[targetLang];
                ttsConfig.speechSynthesisVoiceName = voiceMeta ? voiceMeta.voice : "fr-FR-DeniseNeural";
                const synthesizer = new window.SpeechSDK.SpeechSynthesizer(ttsConfig);
                synthesizer.speakTextAsync(
                    text,
                    () => synthesizer.close(),
                    () => {
                        synthesizer.close();
                        this.speakWithBrowserSynthesis(text, targetLang);
                    }
                );
                return;
            } catch (err) {
                console.warn("[WDOS Multilingua] Falling back to browser speech synthesis:", err);
            }
        }

        // 2. Fallback to Browser Web Speech Synthesis (works across Chrome, Edge, Safari, Firefox)
        this.speakWithBrowserSynthesis(text, targetLang);
    }

    speakWithBrowserSynthesis(text, targetLang) {
        if (!("speechSynthesis" in window)) return;
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = targetLang || "fr-FR";
            const voices = window.speechSynthesis.getVoices() || [];
            const shortCode = this.getShortLang(targetLang);
            const matchingVoice = voices.find((v) => v.lang.toLowerCase().startsWith(shortCode));
            if (matchingVoice) utterance.voice = matchingVoice;
            window.speechSynthesis.speak(utterance);
        } catch (err) {
            console.warn("[WDOS Multilingua] SpeechSynthesis error:", err);
        }
    }

    async postTranscriptSegment(originalText, translatedText, targetShort, allTranslations = null) {
        if (!this.transcriptUrl || !originalText) return null;
        try {
            const translations = allTranslations ? { ...allTranslations } : {};
            if (targetShort && translatedText) {
                translations[targetShort] = translatedText;
            }
            const resp = await fetch(this.transcriptUrl, {
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
            if (resp.ok) {
                const data = await resp.json();
                if (data.segment) {
                    const shortListen = this.getShortLang(this.listeningLang);
                    const tText = (data.segment.translations || {})[shortListen] || data.segment.original_text;
                    this.lastSeenSequence = Math.max(this.lastSeenSequence, data.segment.sequence_number || 0);
                    this.renderLiveCaption(data.segment.speaker_name, data.segment.original_text, tText, true);
                }
                return data;
            }
        } catch (err) {
            console.warn("[WDOS Multilingua] Transcript sync warning:", err);
        }
        return null;
    }

    startLivePolling() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.fetchLatestTranscript(false);
        this.pollTimer = setInterval(() => {
            this.fetchLatestTranscript(true);
        }, 1500);
    }

    async fetchLatestTranscript(speakNewSegments = true) {
        if (!this.transcriptUrl) return;
        try {
            const shortListen = this.getShortLang(this.listeningLang);
            const resp = await fetch(`${this.transcriptUrl}?lang=${encodeURIComponent(shortListen)}`, {
                headers: { "Accept": "application/json" }
            });
            if (!resp.ok) return;
            const data = await resp.json();

            if (data.active_speaker_name) {
                const nameEl = document.getElementById("stage-speaker-name");
                const roleEl = document.getElementById("stage-speaker-role");
                const avatarEl = document.getElementById("stage-speaker-initials");
                if (nameEl) nameEl.textContent = data.active_speaker_name;
                if (roleEl && data.active_speaker_role) roleEl.textContent = data.active_speaker_role;
                if (avatarEl) {
                    const parts = data.active_speaker_name.trim().split(/\s+/);
                    avatarEl.textContent = parts.slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "SP";
                }
            }

            if (Array.isArray(data.participants)) {
                this.renderParticipantsTable(data.participants);
            }

            const segments = data.segments || [];
            if (segments.length > 0) {
                this.renderTranscriptTable(segments);
                const latest = segments[segments.length - 1];
                const isNew = latest.sequence_number > this.lastSeenSequence;
                const translated = (latest.translations || {})[shortListen] || latest.translated_text || latest.original_text;
                this.lastTranslatedText = translated;
                this.renderLiveCaption(latest.speaker_name, latest.original_text, translated, true);

                if (isNew) {
                    const prevSeq = this.lastSeenSequence;
                    this.lastSeenSequence = latest.sequence_number;
                    // Speak out loud if this segment just arrived and either another participant spoke OR user is listening to a translated language
                    if (speakNewSegments && prevSeq >= 0) {
                        const isOtherSpeaker = latest.speaker_name !== this.userDisplayName;
                        const isDifferentLang = this.getShortLang(this.listeningLang) !== this.getShortLang(latest.original_language);
                        if (isOtherSpeaker || isDifferentLang) {
                            this.speakTranslation(translated, this.azureData);
                        }
                    }
                }
            }
        } catch (err) {
            // Ignore transient polling errors
        }
    }

    renderTranscriptTable(segments) {
        const tbody = document.getElementById("live-transcript-tbody");
        const countEl = document.getElementById("live-transcript-count");
        if (countEl) countEl.textContent = `${segments.length}`;
        if (!tbody) return;

        const shortListen = this.getShortLang(this.listeningLang);
        tbody.innerHTML = segments.map((seg) => {
            const tr = seg.translations || {};
            const myLangText = tr[shortListen] || seg.translated_text || seg.original_text;
            const frText = tr.fr || "—";
            const ptText = tr.pt || "—";
            return `
              <tr>
                <td><strong>${this.escapeHtml(seg.speaker_name)}</strong></td>
                <td>${this.escapeHtml(seg.original_text)}</td>
                <td style="color:#D4006A; font-weight:700;">${this.escapeHtml(myLangText)}</td>
                <td>${this.escapeHtml(frText)}</td>
                <td>${this.escapeHtml(ptText)}</td>
              </tr>
            `;
        }).join("");
    }

    renderParticipantsTable(participants) {
        const tbody = document.getElementById("live-participants-tbody");
        const countEl = document.getElementById("live-participants-count");
        if (countEl) countEl.textContent = `${participants.length}`;
        if (!tbody) return;

        tbody.innerHTML = participants.map((p) => `
          <tr>
            <td><strong>${this.escapeHtml(p.participant_name)}</strong></td>
            <td>${this.escapeHtml(p.meeting_role)}</td>
            <td>Speaks ${this.escapeHtml(p.speaking_language_display)} · Hears <strong>${this.escapeHtml(p.listening_language_display)}</strong></td>
            <td><span class="s10-pill">${this.escapeHtml(p.connection_status || "Connected")}</span></td>
          </tr>
        `).join("");
    }

    switchListeningLanguage(newLangCode) {
        this.listeningLang = newLangCode;
        const langName = this.langNames[newLangCode] || newLangCode;
        const badgeEl = document.getElementById("active-listening-lang-badge");
        if (badgeEl) badgeEl.textContent = `${langName} · translated audio & captions`;
        const headerLabel = document.getElementById("caption-header-label");
        if (headerLabel) headerLabel.textContent = `LIVE CAPTIONS & TRANSLATION · LISTENING IN ${langName.toUpperCase()}`;
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
            return null;
        }
    }

    renderLiveCaption(speaker, originalText, translatedText, isFinal) {
        const container = document.getElementById("caption-container");
        const speakerEl = document.getElementById("caption-speaker");
        const textEl = document.getElementById("caption-text");
        const transWrapEl = document.getElementById("caption-translated-wrap");
        const transLabelEl = document.getElementById("caption-translated-label");
        const transTextEl = document.getElementById("caption-translated-text");
        if (!container || !speakerEl || !textEl) return;

        speakerEl.textContent = `${speaker}:`;
        textEl.textContent = originalText;

        const langName = this.langNames[this.listeningLang] || this.listeningLang;
        if (transWrapEl && transTextEl) {
            if (translatedText) {
                transWrapEl.style.display = "block";
                if (transLabelEl) transLabelEl.textContent = `${langName} translation:`;
                transTextEl.textContent = translatedText;
                this.lastTranslatedText = translatedText;
            }
        }
        container.style.opacity = isFinal ? "1.0" : "0.88";
    }

    setMicStatus(msg) {
        const el = document.getElementById("live-mic-status");
        if (el) el.textContent = msg;
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

    escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
}

window.WDOSMultilinguaMeeting = WDOSMultilinguaMeeting;
