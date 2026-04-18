class AudioPlaybackManager {
    constructor() {
        this.queue = [];
        this.isPlaying = false;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.currentAudioElement = null;
    }

    unlockAudio() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    queueAudio(url) {
        this.queue.push(url);
        if (!this.isPlaying) {
            this._playNext();
        }
    }

    _playNext() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            return;
        }

        this.isPlaying = true;
        const url = this.queue.shift();

        this.currentAudioElement = new Audio(url);
        
        this.currentAudioElement.onended = () => {
            this._playNext();
        };
        
        this.currentAudioElement.onerror = () => {
            console.error("Failed to play audio:", url);
            this._playNext();
        };

        this.currentAudioElement.play().catch(e => {
            console.error("Autoplay prevented or playback failed:", e);
            this._playNext();
        });
    }

    playAlertTone() {
        if (!this.audioContext) return;
        this.unlockAudio();
        
        const osc = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
        osc.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, this.audioContext.currentTime + 0.05);
        gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.4);
        
        osc.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.5);
    }
}
