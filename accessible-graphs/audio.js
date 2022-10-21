
// Audio class
// Sets up audio stuff (compressor, gain), 
// sets up an oscillator that has good falloff (no clipping sounds) and can be instanced to be played anytime and can handle overlaps, 
// sets up an actual playTone function that plays tones based on current chart position
class Audio {

    constructor(plot, position) {
        this.AudioContext = window['AudioContext'] || window['webkitAudioContext'];
        this.audioContext = new AudioContext();
        this.compressor = this.compressorSetup(this.audioContext);
        this.plot = plot;
        this.position = position;
    }

    compressorSetup() {
        let compressor = this.audioContext.createDynamicsCompressor(); // create compressor for better audio quality

        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        compressor.release.value = .25;
        let gainMaster = this.audioContext.createGain(); // create master gain
        gainMaster.gain.value = constants.vol;
        compressor.connect(gainMaster);
        gainMaster.connect(this.audioContext.destination);

        return compressor;
    }

    // an oscillator is created and destroyed after some falloff
    playTone() {

        let currentDuration = constants.duration;

        // freq goes between min / max as x goes between min(0) / max
        let thisX = this.plot.plotData[this.position.y][this.position.x].x;
        let frequency = this.SlideBetween(thisX, constants.minX, constants.maxX, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY); 
        if ( constants.debugLevel > 0 ) {
            console.log('will play tone at freq', frequency);
            console.log('based on', constants.minX, '<', thisX, '<', constants.maxX, ' | min', constants.MIN_FREQUENCY, 'max', constants.MAX_FREQUENCY);
        }

        // create oscillator
        // different types of sounds for different regions. 
        // outlier = short tone
        // whisker = normal tone
        // range = chord 
        let sectionType = this.plot.plotData[this.position.y][this.position.x].type;
        if ( sectionType == "outlier" ) {
            currentDuration = constants.duration / 2;
        } else if ( sectionType == "whisker" ) {
            currentDuration = constants.duration * 2; 
        } else {
            currentDuration = constants.duration * 2;
        }
        let panning = this.SlideBetween(this.plot.plotData[this.position.y][this.position.x].x, constants.minX, constants.maxX, -1, 1);

        // create tones
        this.playOscillator(frequency, currentDuration, panning, constants.vol, 'sine');
        if (sectionType == "range" ) {
            // also play octive freq above frequency
            let freq2 = frequency / 2;
            this.playOscillator(freq2, currentDuration, panning, constants.vol/4, 'triangle');
        }

    }

    playOscillator(frequency, currentDuration, panning, currentVol=1, wave='sine') {

        const t = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = wave;
        oscillator.frequency.value = parseFloat(frequency);
        oscillator.start();

        // create gain for this event
        const gainThis = this.audioContext.createGain();
        gainThis.gain.setValueCurveAtTime([.5*currentVol, 1*currentVol, .5*currentVol, .5*currentVol, .5*currentVol, .1*currentVol, 1e-4*currentVol], t, currentDuration); // this is what makes the tones fade out properly and not clip

        let MAX_DISTANCE = 10000;
        let posZ = 1;
        const panner = new PannerNode(this.audioContext, {
            panningModel: "HRTF",
            distanceModel: "linear",
            positionX: this.position.x, // todo: this is wrong
            positionY: this.position.y,
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

    SlideBetween(val, a, b, min, max) {
        // helper function that goes between min and max proportional to how val goes between a and b
        let newVal = ( ( ( val - a ) / ( b - a ) ) * ( max - min ) ) + min;
        return newVal;
    }
}
