// variables for audio
var currAudio = -1;
var oscillator;
var audioPlay = true;

// setup audio context
const AudioContext = window['AudioContext'] || window['webkitAudioContext'];
const audioContext = new AudioContext();

svg.addEventListener("keydown", function(e) {
    if (e.which == 32) {
        if (audioPlay) {
          playOscillator(currAudio);
        }
    }

    if (e.which === 39) {
      if (currAudio >= -1 && currAudio < _numBars - 1) {
        currAudio += 1;
        if (audioPlay) {
          playOscillator(currAudio);
        }
      } 
    }
  
    if (e.which === 37) {
      if (currAudio > 0 && currAudio < _numBars) {
        currAudio -= 1;
        if (audioPlay) {
          playOscillator(currAudio);
        }
      } 
    }

    if (e.which == 83) {
      audioPlay = !audioPlay;
    }
});

// an oscillator is created and destroyed whenever a window key (left arrow, right arrow, spacebar)
function playOscillator(curr_audio) {
    // create oscillator
    oscillator = audioContext.createOscillator();
    oscillator.start();

    // setup merger for stereo sound
    var gainNodeL = audioContext.createGain(); // left stereo sound
    var gainNodeR = audioContext.createGain(); // right stereo sound
    var merger = audioContext.createChannelMerger(2);

    oscillator.connect(gainNodeL);
    oscillator.connect(gainNodeR);

    gainNodeL.connect(merger, 0, 0);
    gainNodeR.connect(merger, 0, 1);

    oscillator.type = 'sine';

    gainNodeL.gain.value = 1 - (1 / 6.0) * curr_audio;
    gainNodeR.gain.value = (1 / 6.0) * curr_audio;

    let frequency = MIN_FREQUENCY;
    if (ymax != ymin) {
        frequency += (height[curr_audio] - ymin) * (1000 - 100) / (ymax - ymin);
    }
    oscillator.frequency.value = parseFloat(frequency);
    merger.connect(audioContext.destination);

    // play sound for 0.3 second
    oscillator.stop(audioContext.currentTime + 0.3);
}