// variables for audio
// put these in user controls ater
var audio_row = -1;
var audio_col = -1;
var audioPlay = true;
var duration = .3;
var vol = .5;

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

if ( false ) {
svg_container.addEventListener("keydown", function (e) {
    // spacebar
    if (e.which == 32) {
        if (audioPlay) {
            playOscillator(audio_row, audio_col);
        }
    }

    // right arrow
    if (e.which === 39) {
        if (audio_row == -1 && audio_col == -1) {
            audio_col++;
            audio_row++;
            if (audioPlay) {
                playOscillator(audio_row, audio_col);
            }
        } else if (audio_col >= -1 && audio_col < num_cols - 1) {
            audio_col += 1;
            if (audioPlay) {
                playOscillator(audio_row, audio_col);
            }
        }
    }

    // left arrow
    if (e.which === 37) {
        if (audio_col > 0 && audio_col < num_cols) {
            audio_col -= 1;
            if (audioPlay) {
                playOscillator(audio_row, audio_col);
            }
        }
    }

    // up arrow
    if (e.which === 38) {
        if (audio_row > 0 && audio_row < num_rows) {
            audio_row -= 1;
            if (audioPlay) {
                playOscillator(audio_row, audio_col);
            }
        }
    }

    // down arrow
    if (e.which === 40) {
        if (audio_row >= -1 && audio_row < num_rows - 1) {
            audio_row += 1;
            if (audioPlay) {
                playOscillator(audio_row, audio_col);
            }
        }
    }

    // s toggle
    if (e.which == 83) {
        audioPlay = !audioPlay;
    }
});
}

// an oscillator is created and destroyed whenever a window key (left arrow, right arrow, spacebar)
function playOscillator(row, col) {
    const t = audioContext.currentTime;

    // create oscillator
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';

    let frequency = MIN_FREQUENCY;
    if (ymax != ymin && row > -1 && col > -1) {
        if (norms[row][col] != 0) {
            frequency += (ymax - norms[row][col] - ymin) * (1000 - 100) / (ymax - ymin);
        } else {
            oscillator.type = 'square';
        }
    }

    oscillator.frequency.value = parseFloat(frequency);
    oscillator.start();

    // create gain for this event
    const gainThis = audioContext.createGain();
    gainThis.gain.setValueCurveAtTime([.5, 1, .5, .5, .5, .1, 1e-4], t, duration); // this is what makes the tones fade out properly and not clip

    const MAX_DISTANCE = 10000;
    var posX = x_coord[row][col];
    var posY = (unique_y_coord[row] - 2 * unique_y_coord[num_cols - 1]) / (unique_y_coord[0] - unique_y_coord[num_cols - 1]) * MAX_DISTANCE;
    var posZ = 1;
    const panner = new PannerNode(audioContext, {
        panningModel: "HRTF",
        distanceModel: "linear",
        positionX: posX,
        positionY: posY,
        positionZ: posZ,
        orientationX: 0.0,
        orientationY: 0.0,
        orientationZ: -1.0,
        refDistance: 1,
        maxDistance: 10000,
        rolloffFactor: 10,
        coneInnerAngle: 40,
        coneOuterAngle: 50,
        coneOuterGain: 0.4,
    });

    // create panning
    var pan_col = (num_cols % 2 == 0) ? num_cols : num_cols - 1;
    var panning = (col - (pan_col / 2)) / (pan_col / 2); // panning = -1 (left) to 1 (right) as x axis (curr_audio) goes from min to max
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
