export default class Audio {
    playEnd() {
    }

    AudioContext: AudioContext;
    audioContext: AudioContext;
    compressor: DynamicsCompressorNode;
    smoothGain: GainNode;

    constructor() {
        this.AudioContext = (window as any)['AudioContext'] || (window as any)['webkitAudioContext'];
        this.audioContext = new AudioContext();
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.smoothGain = this.audioContext.createGain();

        // Set up audio nodes
        this.compressor.threshold.value = -50;
        this.compressor.knee.value = 40;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0;
        this.smoothGain.gain.value = 0.5;

        this.compressor.release.value = 0.25;

        this.compressor.connect(this.smoothGain);
        this.smoothGain.connect(this.audioContext.destination);
    }

    playTone(freq = 440, type: OscillatorType = 'sine', duration = 1) {
        const currentDuration = window.constants.duration;
        const volume = window.constants.vol;

        let rawPanning = 0;
        let rawFreq = 0;
        let frequency = 0;
        let panning = 0;

        // freq goes between min / max as rawFreq goes between min(0) / max
        rawFreq = window.plot.plotData[window.position!.x];
        rawPanning = window.position!.x;
        frequency = this.slideBetween(
            rawFreq,
            window.constants.minY,
            window.constants.maxY,
            window.constants.MIN_FREQUENCY,
            window.constants.MAX_FREQUENCY
        );
        panning = this.slideBetween(
            rawPanning,
            window.constants.minX,
            window.constants.maxX,
            -1,
            1
        );

        this.playOscillator(frequency, currentDuration, panning, volume, type);
    }

    playOscillator(frequency: number,
                   currentDuration: number,
                   panning: number,
                   currentVol = 1,
                   wave: OscillatorType = 'sine') {
        const t = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = wave;
        oscillator.frequency.value = frequency;
        oscillator.start();

        // create gain for this event
        const gainThis = this.audioContext.createGain();
        gainThis.gain.setValueCurveAtTime(
            [
                0.5 * currentVol,
                1 * currentVol,
                0.5 * currentVol,
                0.5 * currentVol,
                0.5 * currentVol,
                0.1 * currentVol,
                1e-4 * currentVol,
            ],
            t,
            currentDuration
        ); // this is what makes the tones fade out properly and not clip

        let MAX_DISTANCE = 10000;
        let posZ = 1;
        const panner = new PannerNode(this.audioContext, {
            panningModel: 'HRTF',
            distanceModel: 'linear',
            positionX: window.position!.x,
            positionY: window.position!.y,
            positionZ: posZ,
            orientationX: 0.0,
            orientationY: 0.0,
            orientationZ: -1.0,
            refDistance: 1,
            maxDistance: MAX_DISTANCE,
            rolloffFactor: 10,
            coneInnerAngle: 40,
            coneOuterAngle: 50,
            coneOuterGain: 0.4,
        });

        // create panning
        const stereoPanner = this.audioContext.createStereoPanner();
        stereoPanner.pan.value = panning;
        oscillator.connect(gainThis);
        gainThis.connect(stereoPanner);
        stereoPanner.connect(panner);
        panner.connect(this.compressor);

        // create panner node

        // play sound for duration
        setTimeout(() => {
            panner.disconnect();
            gainThis.disconnect();
            oscillator.stop();
            oscillator.disconnect();
        }, currentDuration * 1e3 * 2);
    }

    slideBetween(val: number, a: number, b: number, min: number, max: number): number {
        let newVal = ((val - a) / (b - a)) * (max - min) + min;
        if (a == 0 && b == 0) {
            newVal = 0;
        }
        return newVal;
    }
}
