import { Constants } from "../constants";
import { Position } from "../helpers/position";

export abstract class AudioManager {
    protected AudioContext: AudioContext;
    protected audioContext: AudioContext;
    protected compressor: DynamicsCompressorNode;
    protected smoothGain: GainNode;
    position: Position;
    constants: Constants;

    constructor() {
        this.constants = window.constants;
        this.AudioContext = (window as any)['AudioContext'] || (window as any)['webkitAudioContext'];
        this.audioContext = new AudioContext();
        this.compressor = this.compressorSetup();
        this.smoothGain = this.audioContext.createGain();
        this.position = new Position();
    }

    protected compressorSetup(): DynamicsCompressorNode {
        const compressor = this.audioContext.createDynamicsCompressor();
        const smoothGain = this.audioContext.createGain();
        
        compressor.threshold.value = -50;
        compressor.knee.value = 40;
        compressor.ratio.value = 12;
        compressor.attack.value = 0;
        smoothGain.gain.value = 0.5;

        compressor.release.value = 0.25;

        compressor.connect(smoothGain);
        smoothGain.connect(this.audioContext.destination);

        return compressor;
    }

    protected playOscillator(
        frequency: string,
        currentDuration: number,
        panning: number,
        currentVol: number = 1,
        wave: OscillatorType = Constants.OSCILLATOR_TYPES.SINE
      ) : void {
        const t = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = wave;
        oscillator.frequency.value = parseFloat(frequency);
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
          positionX: this.position.x,
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
    
    protected playSmooth(
        freqArr: number[] = [600, 500, 400, 300],
        currentDuration: number = 2,
        panningArr: number[] = [-1, 0, 1],
        currentVol: number = 1,
        wave: OscillatorType = Constants.OSCILLATOR_TYPES.SINE
      ) {    
        let gainArr = new Array(freqArr.length * 3).fill(0.5 * currentVol);
        gainArr.push(1e-4 * currentVol);
    
        const t = this.audioContext.currentTime;
        const smoothOscillator = this.audioContext.createOscillator();
        smoothOscillator.type = wave;
        smoothOscillator.frequency.setValueCurveAtTime(freqArr, t, currentDuration);
        smoothOscillator.start();
        this.constants.isSmoothAutoplay = true;
    
        // create gain for this event
        this.smoothGain = this.audioContext.createGain();
        this.smoothGain.gain.setValueCurveAtTime(gainArr, t, currentDuration); // this is what makes the tones fade out properly and not clip
    
        let MAX_DISTANCE = 10000;
        let posZ = 1;
        const panner = new PannerNode(this.audioContext, {
          panningModel: 'HRTF',
          distanceModel: 'linear',
          positionX: this.position.x,
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
        stereoPanner.pan.setValueCurveAtTime(panningArr, t, currentDuration);
        smoothOscillator.connect(this.smoothGain);
        this.smoothGain.connect(stereoPanner);
        stereoPanner.connect(panner);
        panner.connect(this.compressor);
    
        // play sound for duration
        this.constants.smoothId = setTimeout(() => {
          panner.disconnect();
          this.smoothGain.disconnect();
          smoothOscillator.stop();
          smoothOscillator.disconnect();
          this.constants.isSmoothAutoplay = false;
        }, currentDuration * 1e3 * 2);
    }

    protected PlayNull() {
        let frequency = this.constants.NULL_FREQUENCY;
        let duration = this.constants.duration;
        let panning = 0;
        let vol = this.constants.vol;
        let wave = 'triangle';
    
        this.playOscillator(frequency, duration, panning, vol, wave);
    
        setTimeout(
          function (audioThis) {
            audioThis.playOscillator(
              (frequency * 23) / 24,
              duration,
              panning,
              vol,
              wave
            );
          },
          Math.round((duration / 5) * 1000),
          this
        );
      }
    
    protected playEnd(): void {
        if (this.constants.canPlayEndChime && this.constants.endChime instanceof AudioBuffer) {
          try {
            const source = this.audioContext.createBufferSource();
            source.buffer = this.constants.endChime;
            source.connect(this.audioContext.destination);
            source.start();
            
            // Clean up after the sound has finished playing
            source.onended = () => {
              source.disconnect();
            };
          } catch (error) {
            console.error('Failed to play end chime:', error);
          }
        }
    }

    protected  KillSmooth() {
        if (this.constants.smoothId) {
          this.smoothGain.gain.cancelScheduledValues(0);
          this.smoothGain.gain.exponentialRampToValueAtTime(
            0.0001,
            this.audioContext.currentTime + 0.03
          );
    
          clearTimeout(this.constants.smoothId);
    
          this.constants.isSmoothAutoplay = false;
        }
    }

    public abstract playTone(params?: any, plotData: any): void;


}