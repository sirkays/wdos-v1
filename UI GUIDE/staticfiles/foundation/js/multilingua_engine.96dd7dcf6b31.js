/**
 * WDOS Multilingua Meeting & Translation Engine (v4)
 * Orchestrates live Microphone Speech-to-Text (Azure AI Speech SDK + Web Speech API),
 * real-time Web Audio microphone level visualizer, multi-language translation
 * (English, French, Portuguese, Arabic, Swahili, Hausa, Yoruba, Igbo),
 * Neural Text-to-Speech audio output (Azure Neural TTS + Web Speech Synthesis fallback),
 * live WebRTC camera preview, and real-time multi-participant room synchronization.
 */

class WDOSMultilinguaMeeting {
    constructor(config) {
        this.meetingId = config.meetingId;
        this.roomCode = config.roomCode || config.meetingId;
        this.tokensUrl = config.tokensUrl;
        this.transcriptUrl = config.transcriptUrl || `/api/rooms/${config.meetingId}/transcript/`;
        this.restoreAudioUrl = config.restoreAudioUrl || `/api/rooms/${config.meetingId}/restore-audio/`;
        this.switchLangUrl = config.switchLangUrl || `/foundation/rooms/${this.roomCode}/live/`;
        this.userDisplayName = config.userDisplayName || "Participant";

        // Language State
        this.speakingLang = config.speakingLang || "en-US";
        this.listeningLang = config.listeningLang || "fr-FR";

        // Provider Clients & Media Streams
        this.azureData = null;
        this.zoomData = null;
        this.zoomClient = null;
        this.mediaStream = null;
        this.localVideoStream = null;
        this.localAudioStream = null;
        this.audioContext = null;
        this.analyserNode = null;
        this.visualizerFrame = null;
        this.speechRecognizer = null;
        this.webSpeechRecognizer = null;

        // Media & Sync Flags
        this.isAudioMuted = true;
        this.isVideoOff = true;
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
                const origBtnHtml = submitBtn ? submitBtn.innerHTML : "";
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = "Translating...";
                }
                input.value = "";
                await this.postTranscriptSegment(text, null, null);
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = origBtnHtml || "Speak";
                }
                await this.fetchLatestTranscript(true);
            });
        });

        const quickLangSelect = document.getElementById("quick-switch-lang");
        if (quickLangSelect) {
            quickLangSelect.addEventListener("change", async () => {
                this.switchListeningLanguage(quickLangSelect.value);
                await this.persistLanguageSelection();
                await this.fetchLatestTranscript(false);
                if (this.lastTranslatedText) {
                    this.speakTranslation(this.lastTranslatedText, this.azureData, true);
                }
            });
        }

        const speakLangSelect = document.getElementById("quick-speaking-lang");
        if (speakLangSelect) {
            speakLangSelect.addEventListener("change", async () => {
                this.speakingLang = speakLangSelect.value;
                this.setMicStatus(`Speaking: ${this.langNames[this.speakingLang] || this.speakingLang} · Hearing: ${this.langNames[this.listeningLang] || this.listeningLang}`);
                await this.persistLanguageSelection();
                if (!this.isAudioMuted) {
                    await this.toggleMicrophone();
                    await this.toggleMicrophone();
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
            this.setMicStatus(`Connected as ${this.userDisplayName} · Speaking ${this.langNames[this.speakingLang] || this.speakingLang} · Hearing ${this.langNames[this.listeningLang] || this.listeningLang}`);
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
                this.triggerSpeakingPulse(this.userDisplayName, 1400);
                const targetShort = this.getShortLang(this.listeningLang);
                const translatedText = (e.result.translations && e.result.translations.get(targetShort)) || e.result.text;
                this.renderLiveCaption(this.userDisplayName, e.result.text, translatedText, false);
            };

            this.speechRecognizer.recognized = async (s, e) => {
                if (e.result && e.result.text && e.result.text.trim()) {
                    this.triggerSpeakingPulse(this.userDisplayName, 1800);
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
            this.speechRecognizer = null;
        }
    }

    triggerSpeakingPulse(speakerName, durationMs = 2400) {
        this.speechPulseUntil = Math.max(this.speechPulseUntil || 0, Date.now() + durationMs);
        this.activeSpeakingPerson = speakerName || this.userDisplayName;

        const waveEl = document.getElementById("stage-waveform");
        const avatarEl = document.getElementById("stage-speaker-initials");
        const nameEl = document.getElementById("stage-speaker-name");
        const indicatorEl = document.getElementById("stage-speaking-indicator");

        if (nameEl && this.activeSpeakingPerson) {
            nameEl.textContent = this.activeSpeakingPerson;
        }
        if (avatarEl && this.activeSpeakingPerson) {
            const parts = String(this.activeSpeakingPerson).trim().split(/\s+/);
            avatarEl.textContent = parts.slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "SP";
            avatarEl.classList.add("is-speaking");
        }
        if (waveEl) {
            waveEl.classList.remove("is-listening");
            waveEl.classList.add("is-speaking", "css-anim");
        }
        if (indicatorEl) {
            indicatorEl.innerHTML = `<span style="color:#4ADE80; font-weight:800;">● ${this.escapeHtml(this.activeSpeakingPerson)} is speaking live...</span>`;
        }

        if (this.speechPulseTimer) clearTimeout(this.speechPulseTimer);
        this.speechPulseTimer = setTimeout(() => {
            if (Date.now() >= (this.speechPulseUntil || 0)) {
                this.resetSpeakingIndicatorState();
            }
        }, durationMs + 60);
    }

    resetSpeakingIndicatorState() {
        const waveEl = document.getElementById("stage-waveform");
        const avatarEl = document.getElementById("stage-speaker-initials");
        const indicatorEl = document.getElementById("stage-speaking-indicator");
        const bars = document.querySelectorAll("#stage-waveform span");

        if (avatarEl) {
            avatarEl.classList.remove("is-speaking");
        }
        if (waveEl) {
            waveEl.classList.remove("is-speaking", "css-anim");
            if (!this.isAudioMuted) {
                waveEl.classList.add("is-listening");
            } else {
                waveEl.classList.remove("is-listening");
            }
        }
        bars.forEach((bar) => {
            bar.style.height = this.isAudioMuted ? "6px" : "8px";
        });
        if (indicatorEl) {
            if (!this.isAudioMuted) {
                indicatorEl.innerHTML = `<span style="color:#86EFAC;">Mic active · Listening for speech...</span>`;
            } else {
                indicatorEl.textContent = "Microphone muted · Waiting for speaker";
            }
        }
    }

    async startMicAudioVisualizer() {
        this.resetSpeakingIndicatorState();
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
            this.localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            this.audioContext = new AudioCtx();
            if (this.audioContext.state === "suspended") {
                try { await this.audioContext.resume(); } catch (_) {}
            }
            const source = this.audioContext.createMediaStreamSource(this.localAudioStream);
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256;
            this.analyserNode.smoothingTimeConstant = 0.45;
            this.analyserNode.minDecibels = -88;
            this.analyserNode.maxDecibels = -22;
            source.connect(this.analyserNode);

            const waveEl = document.getElementById("stage-waveform");
            const avatarEl = document.getElementById("stage-speaker-initials");
            const indicatorEl = document.getElementById("stage-speaking-indicator");
            const bars = document.querySelectorAll("#stage-waveform span");
            const freqData = new Uint8Array(this.analyserNode.frequencyBinCount);
            const timeData = new Uint8Array(this.analyserNode.fftSize);
            const bandWeights = [0.55, 0.85, 1.05, 1.3, 1.05, 0.85, 0.55];

            const animateBars = () => {
                if (this.isAudioMuted || !this.analyserNode) return;
                this.analyserNode.getByteFrequencyData(freqData);
                this.analyserNode.getByteTimeDomainData(timeData);

                let sumSquares = 0;
                for (let i = 0; i < timeData.length; i++) {
                    const normalized = (timeData[i] - 128) / 128;
                    sumSquares += normalized * normalized;
                }
                const rms = Math.sqrt(sumSquares / timeData.length);
                const voiceBinsAvg = (freqData[1] + freqData[2] + freqData[3] + freqData[4] + freqData[5]) / (5 * 255);
                const energy = Math.max(rms * 4.2, voiceBinsAvg * 1.45);
                const isVoiceDetected = energy > 0.065;
                const isPulseActive = Date.now() < (this.speechPulseUntil || 0);

                if (isVoiceDetected) {
                    this.speechPulseUntil = Math.max(this.speechPulseUntil || 0, Date.now() + 380);
                    this.activeSpeakingPerson = this.userDisplayName;
                }

                if (isVoiceDetected || isPulseActive) {
                    if (waveEl) {
                        waveEl.classList.remove("is-listening");
                        waveEl.classList.add("is-speaking");
                        if (isVoiceDetected) {
                            waveEl.classList.remove("css-anim");
                        } else {
                            waveEl.classList.add("css-anim");
                        }
                    }
                    if (avatarEl) avatarEl.classList.add("is-speaking");
                    if (indicatorEl) {
                        const who = this.activeSpeakingPerson || this.userDisplayName;
                        indicatorEl.innerHTML = `<span style="color:#4ADE80; font-weight:800;">● ${this.escapeHtml(who)} is speaking live...</span>`;
                    }

                    if (isVoiceDetected) {
                        bars.forEach((bar, idx) => {
                            const binVal = (freqData[idx + 1] || 0) / 255;
                            const weight = bandWeights[idx % bandWeights.length];
                            const combined = Math.min(1, (energy * 0.75 + binVal * 0.65) * weight);
                            const heightPx = Math.max(10, Math.min(44, Math.round(8 + combined * 36)));
                            bar.style.height = `${heightPx}px`;
                        });
                    }
                } else {
                    if (waveEl) {
                        waveEl.classList.remove("is-speaking", "css-anim");
                        waveEl.classList.add("is-listening");
                    }
                    if (avatarEl) avatarEl.classList.remove("is-speaking");
                    bars.forEach((bar) => {
                        bar.style.height = "8px";
                    });
                    if (indicatorEl) {
                        indicatorEl.innerHTML = `<span style="color:#86EFAC;">Mic active · Listening for speech...</span>`;
                    }
                }

                this.visualizerFrame = requestAnimationFrame(animateBars);
            };
            animateBars();
        } catch (err) {
            console.warn("[WDOS Multilingua] Microphone stream visualizer warning:", err);
        }
    }

    stopMicAudioVisualizer() {
        if (this.visualizerFrame) {
            cancelAnimationFrame(this.visualizerFrame);
            this.visualizerFrame = null;
        }
        if (this.localAudioStream) {
            this.localAudioStream.getTracks().forEach((t) => t.stop());
            this.localAudioStream = null;
        }
        if (this.audioContext) {
            try { this.audioContext.close(); } catch (_) {}
            this.audioContext = null;
        }
        this.analyserNode = null;
        this.resetSpeakingIndicatorState();
    }

    startWebSpeechFallback() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            return false;
        }
        try {
            if (this.webSpeechRecognizer) {
                try { this.webSpeechRecognizer.stop(); } catch (_) {}
            }
            this.webSpeechRecognizer = new SpeechRec();
            this.webSpeechRecognizer.lang = this.speakingLang || "en-US";
            this.webSpeechRecognizer.continuous = true;
            this.webSpeechRecognizer.interimResults = true;

            this.webSpeechRecognizer.onspeechstart = () => {
                this.triggerSpeakingPulse(this.userDisplayName, 1800);
            };

            this.webSpeechRecognizer.onresult = async (event) => {
                let interimText = "";
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        const clean = transcript.trim();
                        if (clean) {
                            this.triggerSpeakingPulse(this.userDisplayName, 2000);
                            this.renderLiveCaption(this.userDisplayName, clean, "Translating live...", false);
                            await this.postTranscriptSegment(clean, null, null);
                            await this.fetchLatestTranscript(true);
                        }
                    } else {
                        interimText += transcript;
                    }
                }
                if (interimText.trim()) {
                    this.triggerSpeakingPulse(this.userDisplayName, 1500);
                    this.renderLiveCaption(this.userDisplayName, interimText.trim(), "Listening...", false);
                }
            };

            this.webSpeechRecognizer.onend = () => {
                if (!this.isAudioMuted && this.webSpeechRecognizer) {
                    try { this.webSpeechRecognizer.start(); } catch (_) {}
                }
            };

            this.webSpeechRecognizer.start();
            return true;
        } catch (err) {
            return false;
        }
    }

    async toggleMicrophone() {
        const micBtns = document.querySelectorAll("#btn-toggle-mic, #btn-start-speaking");

        if (this.isAudioMuted) {
            this.isAudioMuted = false;
            micBtns.forEach((btn) => {
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> <span>Mic On · Speak Now</span>`;
                btn.style.background = "#16A34A";
                btn.style.borderColor = "#4ADE80";
                btn.style.color = "#FFFFFF";
            });
            this.setMicStatus(`LIVE MICROPHONE ON — Speak in ${this.langNames[this.speakingLang] || this.speakingLang}. Your speech is transcribed and translated automatically.`);

            await this.startMicAudioVisualizer();

            if (this.mediaStream) {
                try { await this.mediaStream.unmuteAudio(); } catch (_) {}
            }
            if (this.speechRecognizer) {
                this.speechRecognizer.startContinuousRecognitionAsync(
                    () => {},
                    () => { this.startWebSpeechFallback(); }
                );
            } else {
                this.startWebSpeechFallback();
            }
        } else {
            this.isAudioMuted = true;
            this.stopMicAudioVisualizer();
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
            micBtns.forEach((btn) => {
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> <span>Turn Mic On</span>`;
                btn.style.background = "";
                btn.style.borderColor = "";
                btn.style.color = "";
            });
            this.setMicStatus(`Microphone muted · Click "Turn Mic On" to speak live or type below.`);
        }
        return !this.isAudioMuted;
    }

    async toggleCamera() {
        const camBtns = document.querySelectorAll("#btn-toggle-cam");
        const stageVideo = document.getElementById("live-stage-video") || document.getElementById("prejoin-preview");
        const speakerAvatarBox = document.getElementById("stage-avatar-container");
        const camNotice = document.getElementById("stage-camera-notice");

        if (this.isVideoOff) {
            camBtns.forEach((btn) => {
                btn.textContent = "Starting Camera...";
            });
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("Camera API unavailable in this browser.");
                }
                this.localVideoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                if (stageVideo) {
                    stageVideo.srcObject = this.localVideoStream;
                    stageVideo.style.display = "block";
                    try { await stageVideo.play(); } catch (_) {}
                }
                if (speakerAvatarBox) {
                    speakerAvatarBox.style.display = "none";
                }
                if (camNotice) {
                    camNotice.style.display = "none";
                }
                this.isVideoOff = false;
                camBtns.forEach((btn) => {
                    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg> <span>Camera On</span>`;
                    btn.style.background = "#16A34A";
                    btn.style.borderColor = "#4ADE80";
                    btn.style.color = "#FFFFFF";
                });
                this.setMicStatus("Live camera video active on stage.");
            } catch (err) {
                this.isVideoOff = true;
                camBtns.forEach((btn) => {
                    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg> <span>Camera Unavailable</span>`;
                });
                if (camNotice) {
                    camNotice.textContent = "Webcam is unavailable or in use by another application — Audio & Live Translation Stage is active.";
                    camNotice.style.display = "block";
                }
                this.setMicStatus("Webcam unavailable or blocked by browser — continuing with Voice & Interpretation stage.");
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
            if (camNotice) {
                camNotice.style.display = "none";
            }
            this.isVideoOff = true;
            camBtns.forEach((btn) => {
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg> <span>Turn Camera On</span>`;
                btn.style.background = "";
                btn.style.borderColor = "";
                btn.style.color = "";
            });
            this.setMicStatus("Camera turned off.");
        }
    }

    speakTranslation(text, azureData = null) {
        if (!text) return;
        const activeAzure = azureData || this.azureData;
        const targetLang = this.listeningLang || "fr-FR";

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
                // Fallback below
            }
        }
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
            // Ignore synthesis error
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
                    this.triggerSpeakingPulse(data.segment.speaker_name, 2600);
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
                this.renderParticipantsList(data.participants);
            }

            const segments = data.segments || [];
            if (segments.length > 0) {
                this.renderTranscriptFeed(segments);
                const latest = segments[segments.length - 1];
                const isNew = latest.sequence_number > this.lastSeenSequence;
                const translated = (latest.translations || {})[shortListen] || latest.translated_text || latest.original_text;
                this.lastTranslatedText = translated;
                this.renderLiveCaption(latest.speaker_name, latest.original_text, translated, true);

                if (isNew) {
                    const prevSeq = this.lastSeenSequence;
                    this.lastSeenSequence = latest.sequence_number;
                    if (speakNewSegments && prevSeq >= 0) {
                        this.triggerSpeakingPulse(latest.speaker_name, 3200);
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

    renderTranscriptFeed(segments) {
        const container = document.getElementById("live-transcript-feed");
        const countEl = document.getElementById("live-transcript-count");
        if (countEl) countEl.textContent = `${segments.length}`;
        if (!container) return;

        const shortListen = this.getShortLang(this.listeningLang);
        const langName = this.langNames[this.listeningLang] || "Translated";
        container.innerHTML = segments.slice().reverse().map((seg) => {
            const tr = seg.translations || {};
            const myLangText = tr[shortListen] || seg.translated_text || seg.original_text;
            return `
              <div class="zm-msg-card">
                <div class="zm-msg-header">
                  <strong>${this.escapeHtml(seg.speaker_name)}</strong>
                  <span class="zm-msg-badge">${this.escapeHtml(langName)}</span>
                </div>
                <div class="zm-msg-translated">${this.escapeHtml(myLangText)}</div>
                <div class="zm-msg-original">Original: ${this.escapeHtml(seg.original_text)}</div>
              </div>
            `;
        }).join("");
    }

    renderParticipantsList(participants) {
        const container = document.getElementById("live-participants-list");
        const countEl = document.getElementById("live-participants-count");
        if (countEl) countEl.textContent = `${participants.length}`;
        if (!container) return;

        container.innerHTML = participants.map((p) => {
            const parts = String(p.participant_name || "P").trim().split(/\s+/);
            const initials = parts.slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "P";
            return `
              <div class="zm-person-row">
                <div class="zm-person-avatar">${this.escapeHtml(initials)}</div>
                <div class="zm-person-info">
                  <div class="zm-person-name">${this.escapeHtml(p.participant_name)}</div>
                  <div class="zm-person-meta">${this.escapeHtml(p.meeting_role)} · Speaks ${this.escapeHtml(p.speaking_language_display)} · Hears <strong>${this.escapeHtml(p.listening_language_display)}</strong></div>
                </div>
                <span class="zm-person-status">${this.escapeHtml(p.connection_status || "Online")}</span>
              </div>
            `;
        }).join("");
    }

    async persistLanguageSelection() {
        if (!this.switchLangUrl) return;
        try {
            const formData = new URLSearchParams();
            formData.append("action", "switch_language");
            formData.append("speaking_language", this.speakingLang);
            formData.append("listening_language", this.listeningLang);
            await fetch(this.switchLangUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-CSRFToken": this.getCsrfToken(),
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: formData.toString()
            });
        } catch (err) {
            // Ignore transient network errors
        }
    }

    switchListeningLanguage(newLangCode) {
        this.listeningLang = newLangCode;
        const langName = this.langNames[newLangCode] || newLangCode;
        const headerLabel = document.getElementById("caption-header-label");
        if (headerLabel) headerLabel.textContent = `LIVE TRANSLATION (${langName.toUpperCase()})`;
        const playBtn = document.getElementById("btn-play-translation-label");
        if (playBtn) playBtn.textContent = `Replay Voice (${langName})`;
        const colLang = document.getElementById("transcript-col-lang");
        if (colLang) colLang.textContent = langName.toUpperCase();
        this.setMicStatus(`Connected as ${this.userDisplayName} · Speaking ${this.langNames[this.speakingLang] || this.speakingLang} · Hearing ${langName}`);
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
                if (transLabelEl) transLabelEl.textContent = `[${langName}]:`;
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
