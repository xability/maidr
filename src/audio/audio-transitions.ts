/**
 * Utility functions for creating smooth audio transitions
 * to prevent clicks and pops in Web Audio API
 */

/**
 * Applies a fade-in to an audio parameter using an exponential curve for smoother transitions
 *
 * @param param - The audio parameter to fade in (e.g., gainNode.gain)
 * @param startValue - The starting value (usually near-zero)
 * @param endValue - The target value to fade to
 * @param startTime - When to start the fade (in seconds)
 * @param duration - How long the fade should last (in seconds)
 */
export function fadeIn(
  param: AudioParam,
  startValue: number = 0.001, // Small non-zero value for exponential curve
  endValue: number = 1,
  startTime: number,
  duration: number = 0.015,
): void {
  // Web Audio API requires non-zero value for exponentialRampToValueAtTime
  const safeStartValue = Math.max(0.001, startValue);

  // Cancel any scheduled parameter changes
  try {
    param.cancelScheduledValues(startTime);
  } catch {
    // Ignore errors if no values were scheduled
  }

  // Set the initial value
  param.setValueAtTime(safeStartValue, startTime);

  // Use exponential ramping for more natural volume fades
  param.exponentialRampToValueAtTime(endValue, startTime + duration);
}

/**
 * Applies a fade-out to an audio parameter with an exponential curve for smoother transitions
 *
 * @param param - The audio parameter to fade out (e.g., gainNode.gain)
 * @param startValue - The starting value (usually the current value)
 * @param endValue - The target value to fade to (near-zero)
 * @param startTime - When to start the fade (in seconds)
 * @param duration - How long the fade should last (in seconds)
 */
export function fadeOut(
  param: AudioParam,
  startValue: number = 1,
  endValue: number = 0.001, // Small non-zero value for exponential curve
  startTime: number,
  duration: number = 0.015,
): void {
  // Web Audio API requires non-zero value for exponentialRampToValueAtTime
  const safeStartValue = Math.max(0.001, startValue);
  const safeEndValue = Math.max(0.001, endValue);

  // Cancel any scheduled parameter changes
  try {
    param.cancelScheduledValues(startTime);
  } catch {
    // Ignore errors if no values were scheduled
  }

  // Set the initial value
  param.setValueAtTime(safeStartValue, startTime);

  // Use exponential ramping for more natural volume fades
  param.exponentialRampToValueAtTime(safeEndValue, startTime + duration);

  // Zero the parameter just after the exponential ramp is complete
  if (endValue === 0) {
    param.setValueAtTime(0, startTime + duration + 0.001);
  }
}

/**
 * Creates a crisp envelope for individual data points with minimal smoothing
 * to preserve the clarity and character of the original waveform
 *
 * @param gainNode - The gain node to apply the envelope to
 * @param startTime - When to start the envelope (in seconds)
 * @param duration - Total duration of the sound (in seconds)
 * @param attackTime - How long the attack phase should last (in seconds)
 * @param releaseTime - How long the release phase should last (in seconds)
 * @param sustainLevel - The level to maintain during the sustain phase (default 1)
 */
export function createCrispEnvelope(
  gainNode: GainNode,
  startTime: number,
  duration: number,
  attackTime: number = 0.005, // Shorter attack time for crisp onset
  releaseTime: number = 0.005, // Shorter release time for crisp ending
  sustainLevel: number = 1,
): void {
  // Ensure the envelope fits within the duration
  const maxAttackRelease = duration * 0.3; // Less time spent on attack/release
  const actualAttack = Math.min(attackTime, maxAttackRelease / 2);
  const actualRelease = Math.min(releaseTime, maxAttackRelease / 2);

  // Calculate the sustain start and end times
  const sustainStart = startTime + actualAttack;
  const sustainEnd = startTime + duration - actualRelease;

  // Quick ramp up with minimal smoothing
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(sustainLevel, sustainStart);

  // Strong sustain for clarity
  gainNode.gain.setValueAtTime(sustainLevel, sustainStart);
  gainNode.gain.setValueAtTime(sustainLevel, sustainEnd);

  // Quick ramp down
  gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
}

/**
 * Creates an advanced envelope for an oscillator to prevent clicks and pops
 * with smoother attack and release curves
 *
 * @param gainNode - The gain node to apply the envelope to
 * @param startTime - When to start the envelope (in seconds)
 * @param duration - Total duration of the sound (in seconds)
 * @param attackTime - How long the attack phase should last (in seconds)
 * @param releaseTime - How long the release phase should last (in seconds)
 * @param sustainLevel - The level to maintain during the sustain phase (default 1)
 */
export function createEnvelope(
  gainNode: GainNode,
  startTime: number,
  duration: number,
  attackTime: number = 0.015,
  releaseTime: number = 0.015,
  sustainLevel: number = 1,
): void {
  // Ensure the envelope fits within the duration
  const maxAttackRelease = duration * 0.9;
  const actualAttack = Math.min(attackTime, maxAttackRelease / 2);
  const actualRelease = Math.min(releaseTime, maxAttackRelease / 2);

  // Calculate the sustain start and end times
  const sustainStart = startTime + actualAttack;
  const sustainEnd = startTime + duration - actualRelease;

  // Ensure gain is set to 0 at the start (prevents clicks)
  gainNode.gain.setValueAtTime(0, startTime);

  // Apply attack (fade in) - use exponential for smoother sound
  fadeIn(gainNode.gain, 0.001, sustainLevel, startTime, actualAttack);

  // Hold at sustain level
  if (sustainEnd > sustainStart) {
    gainNode.gain.setValueAtTime(sustainLevel, sustainStart);
    gainNode.gain.setValueAtTime(sustainLevel, sustainEnd);
  }

  // Apply release (fade out) - use exponential for smoother sound
  fadeOut(gainNode.gain, sustainLevel, 0.001, sustainEnd, actualRelease);

  // Ensure gain is set to 0 at the end (prevents lingering sounds)
  gainNode.gain.setValueAtTime(0, startTime + duration + 0.001);
}

/**
 * Creates a smooth DC offset filter to eliminate pops and clicks
 * caused by oscillators starting and stopping
 *
 * @param audioContext - The Web Audio API context
 * @returns A configured DC offset filter node
 */
export function createDCFilter(audioContext: AudioContext): BiquadFilterNode {
  // Create a high-pass filter to remove DC offset
  const dcFilter = audioContext.createBiquadFilter();
  dcFilter.type = 'highpass';
  dcFilter.frequency.value = 20; // 20Hz removes inaudible low frequencies
  dcFilter.Q.value = 0.707; // Butterworth response for flat passband

  return dcFilter;
}

/**
 * Creates a click suppression filter chain
 *
 * @param audioContext - The Web Audio API context
 * @param preserveHighs - Whether to preserve high frequencies (for individual points)
 * @returns An object containing the input and output nodes of the filter chain
 */
export function createClickSuppressor(
  audioContext: AudioContext,
  preserveHighs: boolean = false,
): { input: AudioNode; output: AudioNode } {
  // Create a DC offset filter to block ultra-low frequencies
  const dcFilter = createDCFilter(audioContext);

  // For individual data points, we want minimal filtering to preserve clarity
  if (preserveHighs) {
    return {
      input: dcFilter,
      output: dcFilter,
    };
  }

  // For autoplay, add additional filtering to smooth transitions
  const smoothingFilter = audioContext.createBiquadFilter();
  smoothingFilter.type = 'lowpass';
  smoothingFilter.frequency.value = 18000; // Just below human hearing range
  smoothingFilter.Q.value = 0.5;

  // Connect filters in series
  dcFilter.connect(smoothingFilter);

  return {
    input: dcFilter,
    output: smoothingFilter,
  };
}
