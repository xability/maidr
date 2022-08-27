// get x and y axes information
// use regular expressions
const bars = ["geom_rect.rect.56.1.1", "geom_rect.rect.56.1.2", "geom_rect.rect.56.1.3", "geom_rect.rect.56.1.4", "geom_rect.rect.56.1.5", "geom_rect.rect.56.1.6", "geom_rect.rect.56.1.7"];
const transport = ["GRID.text.70.1.1.tspan.1", "GRID.text.70.1.2.tspan.1", "GRID.text.70.1.3.tspan.1", "GRID.text.70.1.4.tspan.1", "GRID.text.70.1.5.tspan.1", "GRID.text.70.1.6.tspan.1", "GRID.text.70.1.7.tspan.1"];
const y_values = bars.map(getHeight);
var x_values = transport.map(getX);
console.log(y_values);

// display x and y information under bar plot
var x = document.getElementById("x");
var y = document.getElementById("y");

// variables for audio manipulation of bars
var currBar = -1;
var oscStart = false;
var pitch;

// set up oscillator for audio 
// to be edited into a function so that oscillator can be created whenever spacebar is pressed
const AudioContext = window['AudioContext'] || window['webkitAudioContext'];
const audioContext = new AudioContext();

var oscillator = audioContext.createOscillator();
var gainNodeL = audioContext.createGain(); // left stereo sound
var gainNodeR = audioContext.createGain(); // right stereo sound
var merger = audioContext.createChannelMerger(2);

oscillator.connect(gainNodeL);
oscillator.connect(gainNodeR);

gainNodeL.connect(merger, 0, 0);
gainNodeR.connect(merger, 0, 1);

oscillator.type = 'sine';

// start oscillator when spacebar is pressed
window.addEventListener("keydown", function(e) {
  if (e.which == 32) {
    if (!oscStart) {
      oscillator.start();
      oscStart = true;
    } else {
      oscillator.stop();
      this.document.getElementById(bars[currBar]).style.fill = "rgb(89,89,89)";
      currBar = -1;
      oscStart = false;
    }
  }
});

// manipulate bars using left and right arrows
window.addEventListener("keydown", function(e) {
  if (e.which === 39) {
    if (currBar == -1) {
      currBar += 1;
      this.document.getElementById(bars[currBar]).style.fill = "rgb(3,200,9)";
      gainNodeL.gain.value = 1;
      gainNodeR.gain.value = 0;
    } else if (currBar > -1 && currBar < 6) {
      currBar += 1;
      this.document.getElementById(bars[currBar]).style.fill = "rgb(3,200,9)";
      this.document.getElementById(bars[currBar - 1]).style.fill = "rgb(89,89,89)";
      gainNodeL.gain.value = 1 - (1 / 6.0) * currBar;
      gainNodeR.gain.value = (1 / 6.0) * currBar;
    } 
    // else if (currBar == 6) {
    //   currBar = 0;
    //   this.document.getElementById(bars[currBar]).style.fill = "rgb(3,200,9)";
    //   this.document.getElementById(bars[6]).style.fill = "rgb(89,89,89)";
    //   gainNodeL.gain.value = 1;
    //   gainNodeR.gain.value = 0;
    // }
  }

  if (e.which === 37) {
    if (currBar == -1) {
      currBar += 1;
      this.document.getElementById(bars[currBar]).style.fill = "rgb(3,200,9)";
      gainNodeL.gain.value = 1;
      gainNodeR.gain.value = 0;
    } else if (currBar > 0 && currBar < 7) {
      currBar -= 1;
      this.document.getElementById(bars[currBar]).style.fill = "rgb(3,200,9)";
      this.document.getElementById(bars[currBar + 1]).style.fill = "rgb(89,89,89)";
      gainNodeL.gain.value = 1 - (1 / 6.0) * currBar;
      gainNodeR.gain.value = (1 / 6.0) * currBar;
    } 
    // else if (currBar == 0) {
    //   currBar = 6;
    //   this.document.getElementById(bars[currBar]).style.fill = "rgb(3,200,9)";
    //   this.document.getElementById(bars[0]).style.fill = "rgb(89,89,89)";
    //   gainNodeL.gain.value = 0;
    //   gainNodeR.gain.value = 1;
    // }
  }

  // set the frequency depending on the value of each bar
  pitch = 100 + (y_values[currBar] - ymin) * (1000 - 100) / (ymax - ymin);
  oscillator.frequency.value = parseFloat(pitch);
  merger.connect(audioContext.destination);

  // display x and height of bars
  x.innerHTML = "x-value: " + x_values[currBar];
  y.innerHTML = "height: " + y_values[currBar];
});

function getHeight(item) {
  return document.getElementById(item).getAttribute('height');
}

function getX(item) {
  return document.getElementById(item).innerHTML;
}