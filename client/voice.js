class VoiceCaptureManager {
    constructor(onInterim, onDone) {
        this.onInterim = onInterim;
        this.onDone = onDone;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.recognition = null;
        this.finalTranscript = '';
        this._initSpeech();
    }

    _initSpeech() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('Speech recognition not supported - transcript will be empty.');
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
            if (this.onInterim) this.onInterim(this.finalTranscript + interim);
        };
        this.recognition.onerror = (e) => console.warn("SpeechRec error:", e.error);
    }

    _getSupportedMimeType() {
        // Safari iOS needs mp4, Chrome/Firefox prefer webm
        const types = [
            'audio/mp4',
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log('Using MIME type:', type);
                return type;
            }
        }
        console.warn('No supported MIME type found, using default');
        return '';
    }

    async startRecording() {
        if (this.isRecording) return;
        this.isRecording = true;
        this.finalTranscript = '';
        this.audioChunks = [];

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType = this._getSupportedMimeType();
            const options = mimeType ? { mimeType } : {};
            this.mediaRecorder = new MediaRecorder(this.stream, options);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType });
                this._finish(blob);
            };

            this.mediaRecorder.start();

            if (this.recognition) {
                try { this.recognition.start(); } catch(err) {}
            }
        } catch (err) {
            console.error("Microphone access denied or error:", err.name, err.message);
            alert("Mic error: " + err.name + " - " + err.message);
            this.isRecording = false;
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.isRecording = false;
        if (this.recognition) this.recognition.stop();
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    }

    _finish(audioBlob) {
        const formData = new FormData();
        // Use correct extension based on mime type
        const ext = audioBlob.type.includes('mp4') ? 'mp4' : 
                    audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
        formData.append("audio_blob", audioBlob, `recording.${ext}`);
        formData.append("transcript", this.finalTranscript.trim() || "[no transcript]");
        if (this.onDone) this.onDone(formData);
    }
}