"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Audio {
    constructor() {
        this.audioContext = new AudioContext();
        this.compressor = this.initCompressor();
        this.enabled = true;
    }
    initCompressor() {
        const compressor = this.audioContext.createDynamicsCompressor();
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;
        const smoothGain = this.audioContext.createGain();
        smoothGain.gain.value = 0.5;
        compressor.connect(smoothGain);
        smoothGain.connect(this.audioContext.destination);
        return compressor;
    }
    playTone(frequency, duration, panning, volume = 1, wave = 'sine', position) {
        // Play audio only if turned on.
        if (!this.enabled) {
            return;
        }
        // Start with a constant tone.
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = wave;
        oscillator.frequency.value = frequency;
        oscillator.start();
        // Add volume.
        const gainNode = this.audioContext.createGain();
        const startTime = this.audioContext.currentTime;
        const valueCurve = [
            0.5 * volume,
            volume,
            0.5 * volume,
            0.5 * volume,
            0.5 * volume,
            0.1 * volume,
            1e-4 * volume,
        ];
        gainNode.gain.setValueCurveAtTime(valueCurve, startTime, duration);
        // Pane the audio.
        const stereoPannerNode = this.audioContext.createStereoPanner();
        stereoPannerNode.pan.value = panning;
        // Coordinate the audio slightly in front of the listener.
        const pannerNode = new PannerNode(this.audioContext, {
            distanceModel: 'linear',
            positionX: 0.0,
            positionY: 0.0,
            positionZ: 0.0,
            orientationX: 0.0,
            orientationY: 0.0,
            orientationZ: -1.0,
            refDistance: 1,
            maxDistance: 1e4,
            rolloffFactor: 10,
            coneInnerAngle: 40,
            coneOuterAngle: 50,
            coneOuterGain: 0.4,
        });
        // Create the audio graph.
        oscillator.connect(gainNode);
        gainNode.connect(stereoPannerNode);
        stereoPannerNode.connect(pannerNode);
        pannerNode.connect(this.compressor);
        // Clean up after the audio stops.
        setTimeout(() => {
            pannerNode.disconnect();
            stereoPannerNode.disconnect();
            gainNode.disconnect();
            oscillator.stop();
            oscillator.disconnect();
        }, duration * 1e3 * 2);
    }
    toggle() {
        this.enabled = !this.enabled;
    }
}
exports.default = Audio;
//# sourceMappingURL=audio.js.map