class VoiceCaptureManager {
    constructor(onInterim, onDone) {
        this.onInterim = onInterim;
        this.onDone = onDone;
        
        this.isRecording = false;
        
        // Audio parts
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        
        // Speech parts
        this.recognition = null;
        this.finalTranscript = '';
        
        this._initSpeech();
    }

    _initSpeech() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported in this browser.');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    this.finalTranscript += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            if (this.onInterim) {
                this.onInterim(this.finalTranscript + interim);
            }
        };

        this.recognition.onerror = (e) => {
            console.warn("SpeechRec error:", e.error);
        };
    }

    async startRecording() {
        if (this.isRecording) return;
        this.isRecording = true;
        this.finalTranscript = '';
        this.audioChunks = [];

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Try opus first, fallback to webm
            let options = { mimeType: 'audio/webm;codecs=opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'audio/webm' };
            }
            
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
                this._finish(blob);
            };

            this.mediaRecorder.start();
            
            if (this.recognition) {
                try { 
                    this.recognition.start(); 
                } catch(err) {
                     // sometimes fails to start if already started
                }
            }
        } catch (err) {
            console.error("Microphone access denied or error:", err);
            this.isRecording = false;
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;

        if (this.recognition) {
            this.recognition.stop();
        }
        
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }

    _finish(audioBlob) {
        // Compile form data and trigger callback
        const formData = new FormData();
        formData.append("audio_blob", audioBlob, "recording.webm");
        formData.append("transcript", this.finalTranscript.trim());
        
        if (this.onDone) {
            this.onDone(formData);
        }
    }
}
