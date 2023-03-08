
// Audio class
// Sets up audio stuff (compressor, gain), 
// sets up an oscillator that has good falloff (no clipping sounds) and can be instanced to be played anytime and can handle overlaps, 
// sets up an actual playTone function that plays tones based on current chart position
class Audio {

    constructor() {
        this.AudioContext = window['AudioContext'] || window['webkitAudioContext'];
        this.audioContext = new AudioContext();
        this.compressor = this.compressorSetup(this.audioContext);
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
        let volume = constants.vol;

        let rawPanning = 0;
        let rawFreq = 0;
        let frequency = 0;
        let panning = 0;
        // freq goes between min / max as rawFreq goes between min(0) / max
        if (constants.chartType == "barchart") {
            rawFreq = plot.plotData[position.x];
            rawPanning = position.x;
            frequency = this.SlideBetween(rawFreq, constants.minY, constants.maxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY);
            panning = this.SlideBetween(rawPanning, constants.minX, constants.maxX, -1, 1);
        } else if (constants.chartType == "boxplot") {
            let xy = orientation == "vert" ? position.x : position.y;
            let yx = orientation == "vert" ? position.y : position.x;
            if (position.z > -1 && Object.hasOwn(plot.plotData[xy][yx], 'values')) {
                // outliers are stored in values with a seperate itterator
                rawFreq = plot.plotData[xy][yx].values[position.z];
            } else {
                // normal points
                if ( orientation == "vert" ) {
                    rawFreq = plot.plotData[xy][yx].y;
                } else {
                    rawFreq = plot.plotData[xy][yx].x;
                }
            }
            if (plot.plotData[xy][yx].type != 'blank') {
                if ( orientation == "vert" ) {
                    frequency = this.SlideBetween(rawFreq, constants.minY, constants.maxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY);
                    panning = this.SlideBetween(rawFreq, constants.minY, constants.maxY, -1, 1);
                } else {
                    frequency = this.SlideBetween(rawFreq, constants.minX, constants.maxX, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY);
                    panning = this.SlideBetween(rawFreq, constants.minX, constants.maxX, -1, 1);
                }
            } else {
                frequency = constants.MIN_FREQUENCY;
                panning = 0;
            }
        } else if (constants.chartType == "heatmap") {
            rawFreq = plot.values[position.y][position.x];
            rawPanning = position.x;
            frequency = this.SlideBetween(rawFreq, constants.minY, constants.maxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY);
            panning = this.SlideBetween(rawPanning, constants.minX, constants.maxX, -1, 1);
        } else if (constants.chartType == "scatterplot") {
            if (constants.layer == 0) { // point layer
                    // more than one point with same x-value
                rawFreq = plot.y[position.x][position.z];
                if (plot.max_count == 1) {
                    volume = constants.vol;
                } else {
                    volume = this.SlideBetween(plot.points_count[position.x][position.z], 1, plot.max_count, constants.vol, constants.MAX_VOL);
                }

                rawPanning = position.x;
                frequency = this.SlideBetween(rawFreq, constants.minY, constants.maxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY);
                panning = this.SlideBetween(rawPanning, constants.minX, constants.maxX, -1, 1);
            } else if (constants.layer == 1) { // best fit line layer

                rawFreq = plot.curvePoints[positionL1.x];
                rawPanning = positionL1.x;
                frequency = this.SlideBetween(rawFreq, plot.curveMinY, plot.curveMaxY, constants.MIN_FREQUENCY, constants.MAX_FREQUENCY);
                panning = this.SlideBetween(rawPanning, constants.minX, constants.maxX, -1, 1);
            }
        }


        if (constants.debugLevel > 5) {
            console.log('will play tone at freq', frequency);
            if ( constants.chartType == "boxplot" ) {
                console.log('based on', constants.minY, '<', rawFreq, '<', constants.maxY, ' | freq min', constants.MIN_FREQUENCY, 'max', constants.MAX_FREQUENCY);
            } else {
                console.log('based on', constants.minX, '<', rawFreq, '<', constants.maxX, ' | freq min', constants.MIN_FREQUENCY, 'max', constants.MAX_FREQUENCY);
            }
        }


        if (constants.chartType == "boxplot") {
            // different types of sounds for different regions. 
            // outlier = short tone
            // whisker = normal tone
            // range = chord 
            let xy = orientation == "vert" ? position.x : position.y;
            let yx = orientation == "vert" ? position.y : position.x;
            let sectionType = plot.plotData[xy][yx].type;
            if (sectionType == "outlier") {
                currentDuration = constants.duration;
            } else if (sectionType == "whisker") {
                currentDuration = constants.duration * 2;
            } else {
                currentDuration = constants.duration * 2;
            }
        }

        // create tones
        this.playOscillator(frequency, currentDuration, panning, volume, 'sine');
        if (constants.chartType == "boxplot") {
            let xy = orientation == "vert" ? position.x : position.y;
            let yx = orientation == "vert" ? position.y : position.x;
            let sectionType = plot.plotData[xy][yx].type;
            if (sectionType == "range") {
                // also play an octive below at lower vol
                let freq2 = frequency / 2;
                this.playOscillator(freq2, currentDuration, panning, constants.vol / 4, 'triangle');
            }
        } else if (constants.chartType == "heatmap") {    // Added heatmap tone feature
            if (rawFreq == 0) {
                this.PlayNull();
            }
        } 

    }
    
    playOscillator(frequency, currentDuration, panning, currentVol = 1, wave = 'sine') {

        const t = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = wave;
        oscillator.frequency.value = parseFloat(frequency);
        oscillator.start();

        // create gain for this event
        const gainThis = this.audioContext.createGain();
        gainThis.gain.setValueCurveAtTime([.5 * currentVol, 1 * currentVol, .5 * currentVol, .5 * currentVol, .5 * currentVol, .1 * currentVol, 1e-4 * currentVol], t, currentDuration); // this is what makes the tones fade out properly and not clip

        let MAX_DISTANCE = 10000;
        let posZ = 1;
        const panner = new PannerNode(this.audioContext, {
            panningModel: "HRTF",
            distanceModel: "linear",
            positionX: position.x,
            positionY: position.y,
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

    playSmooth(freqArr=[600, 500, 400, 300], currentDuration=2, panningArr=[-1, 0, 1], currentVol = 1, wave = 'sine') {
        // todo: make smooth duration dependant on how much line there is to do. Like, at max it should be max duration, but if we only have like a tiny bit to play we should just play for a tiny bit

        let gainArr = new Array(freqArr.length * 3).fill(.5 * currentVol);
        gainArr.push(1e-4 * currentVol);

        const t = this.audioContext.currentTime;
        const smoothOscillator = this.audioContext.createOscillator();
        smoothOscillator.type = wave;
        smoothOscillator.frequency.setValueCurveAtTime(freqArr, t, currentDuration)
        smoothOscillator.start();
        constants.isSmoothAutoplay = true;

        // create gain for this event
        this.smoothGain = this.audioContext.createGain();
        this.smoothGain.gain.setValueCurveAtTime(gainArr, t, currentDuration); // this is what makes the tones fade out properly and not clip

        let MAX_DISTANCE = 10000;
        let posZ = 1;
        const panner = new PannerNode(this.audioContext, {
            panningModel: "HRTF",
            distanceModel: "linear",
            positionX: position.x,
            positionY: position.y,
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
        stereoPanner.pan.setValueCurveAtTime(panningArr, t, currentDuration);
        smoothOscillator.connect(this.smoothGain);
        this.smoothGain.connect(stereoPanner);
        stereoPanner.connect(panner);
        panner.connect(this.compressor);

        // play sound for duration
        constants.smoothId = setTimeout(() => {
            panner.disconnect();
            this.smoothGain.disconnect();
            smoothOscillator.stop();
            smoothOscillator.disconnect();
            constants.isSmoothAutoplay = false;
        }, currentDuration * 1e3 * 2);
    }

    PlayNull() {
        let frequency = constants.NULL_FREQUENCY;
        let duration = constants.duration;
        let panning = 0;
        let vol = constants.vol;
        let wave = 'triangle';

        this.playOscillator(frequency, duration, panning, vol, wave);

        setTimeout(function (audioThis) {
            audioThis.playOscillator(frequency * 23 / 24, duration, panning, vol, wave);
        }, Math.round(duration / 5 * 1000), this);
    }

    playEnd() {
        // play a pleasent end chime. We'll use terminal chime from VSCode
        if ( constants.canPlayEndChime ) {
            let chimeClone = constants.endChime.cloneNode(true); // we clone so that we can trigger a tone while one is already playing
            /* 
             * the following (panning) only works if we're on a server
        let panning = 0;
        try {
            if ( constants.chartType == 'barchart' ) {
                panning = this.SlideBetween(position.x, 0, plot.bars.length-1, -1, 1);
            } else if ( constants.chartType == 'boxplot' ) {
                panning = this.SlideBetween(position.x, 0, plot.plotData[position.y].length-1, -1, 1);
            } else if ( constants.chartType == 'heatmap' ) {
                panning = this.SlideBetween(position.x, 0, plot.num_cols-1, -1, 1);
            } else if ( constants.chartType == 'scatterplot' ) {
                panning = this.SlideBetween(position.x, 0, plot.x.length-1, -1, 1);
            }
        } catch {
        }

        const track = this.audioContext.createMediaElementSource(chimeClone);
        const stereoNode = new StereoPannerNode(this.audioContext, {pan:panning} );
        track.connect(stereoNode).connect(this.audioContext.destination);
        */
            chimeClone.play();
            chimeClone = null;
        }
    }

    KillSmooth() {
        if ( constants.smoothId ) {
            this.smoothGain.gain.cancelScheduledValues(0);
            this.smoothGain.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.03);

            clearTimeout(constants.smoothId);

            constants.isSmoothAutoplay = false;
        }

    }

    SlideBetween(val, a, b, min, max) {
        // helper function that goes between min and max proportional to how val goes between a and b
        let newVal = (((val - a) / (b - a)) * (max - min)) + min;
        return newVal;
    }
}
