// variables for audio
// put these in user controls ater
var audio_row = -1;
var audio_col = -1;
var audioPlay = 1;
var duration = .3;
var vol = .5;

const MAX_FREQUENCY = 1000;
const MIN_FREQUENCY = 100;

// audio setup
const AudioContext = window['AudioContext'] || window['webkitAudioContext'];
const audioContext = new AudioContext();
const compressor = audioContext.createDynamicsCompressor(); // create compressor for better audio quality
compressor.threshold.value = -50;
compressor.knee.value = 40;
compressor.ratio.value = 12;
compressor.attack.value = 0;
compressor.release.value = .25;
var gainMaster = audioContext.createGain(); // create master gain
gainMaster.gain.value = vol;
compressor.connect(gainMaster);
gainMaster.connect(audioContext.destination);


// an oscillator is created and destroyed whenever a window key (left arrow, right arrow, spacebar), run from event listener in main controls
function playTone() {

    let thisDuration = duration;

    // freq goes between min / max as x goes between min(0) / max
    let thisX = plotData[currentPosition.y][currentPosition.x].x;
    let frequency = SlideBetween(thisX, minX, maxX, MIN_FREQUENCY, MAX_FREQUENCY); 
    console.log('will play tone at freq', frequency);
    console.log('based on', minX, '<', thisX, '<', maxX, ' | min', MIN_FREQUENCY, 'max', MAX_FREQUENCY);

    // create oscillator
    // different types of sounds for different regions. 
    // outlier = short tone
    // whisker = normal tone
    // range = chord 
    let sectionType = plotData[currentPosition.y][currentPosition.x].type;
    if ( sectionType == "outlier" ) {
        thisDuration = duration / 2;
    } else if ( sectionType == "whisker" ) {
        thisDuration = duration * 2; 
    } else {
        thisDuration = duration * 2;
    }
    var panning = SlideBetween(plotData[currentPosition.y][currentPosition.x].x, minX, maxX, -1, 1);

    // create tones
    playOscillator(frequency, thisDuration, panning, vol, 'sine');
    if (sectionType == "range" ) {
        // also play octive freq above frequency
        var freq2 = frequency / 2;
        playOscillator(freq2, thisDuration, panning, vol/4, 'triangle');
    }

}

function playOscillator(frequency, duration, panning, vol=1, wave='sine') {

    const t = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.value = parseFloat(frequency);
    oscillator.start();

    // create gain for this event
    const gainThis = audioContext.createGain();
    gainThis.gain.setValueCurveAtTime([.5*vol, 1*vol, .5*vol, .5*vol, .5*vol, .1*vol, 1e-4*vol], t, duration); // this is what makes the tones fade out properly and not clip

    let MAX_DISTANCE = 10000;
    let posZ = 1;
    const panner = new PannerNode(audioContext, {
        panningModel: "HRTF",
        distanceModel: "linear",
        positionX: currentPosition.x, // todo: this is wrong
        positionY: currentPosition.y,
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
    const stereoPanner = audioContext.createStereoPanner();
    stereoPanner.pan.value = panning;
    oscillator.connect(gainThis);
    gainThis.connect(stereoPanner);
    stereoPanner.connect(panner);
    panner.connect(compressor);

    // create panner node 

    // play sound for duration
    setTimeout(() => {
        panner.disconnect();
        gainThis.disconnect();
        oscillator.stop();
        oscillator.disconnect();
    }, duration * 1e3 * 2);
}

function SlideBetween(val, a, b, min, max) {
    // helper function that goes between min and max proportional to how val goes between a and b
    newVal = ( ( ( val - a ) / ( b - a ) ) * ( max - min ) ) + min;
    return newVal;
}
