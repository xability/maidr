/**
 * Utility functions for creating smooth audio transitions
 * to prevent clicks and pops in Web Audio API
 */

/**
 * Applies a fade-in to an audio parameter
 * @param param - The audio parameter to fade in (e.g., gainNode.gain)
 * @param startValue - The starting value (usually 0)
 * @param endValue - The target value to fade to
 * @param startTime - When to start the fade (in seconds)
 * @param duration - How long the fade should last (in seconds)
 */
export function fadeIn(
  param: AudioParam,
  startValue: number = 0,
  endValue: number = 1,
  startTime: number,
  duration: number = 0.015,
): void {
  param.setValueAtTime(startValue, startTime);
  param.linearRampToValueAtTime(endValue, startTime + duration);
}

/**
 * Applies a fade-out to an audio parameter
 * @param param - The audio parameter to fade out (e.g., gainNode.gain)
 * @param startValue - The starting value (usually the current value)
 * @param endValue - The target value to fade to (usually 0)
 * @param startTime - When to start the fade (in seconds)
 * @param duration - How long the fade should last (in seconds)
 */
export function fadeOut(
  param: AudioParam,
  startValue: number = 1,
  endValue: number = 0,
  startTime: number,
  duration: number = 0.015,
): void {
  param.setValueAtTime(startValue, startTime);
  param.linearRampToValueAtTime(endValue, startTime + duration);
}

/**
 * Creates an envelope for an oscillator to prevent clicks and pops
 * @param gainNode - The gain node to apply the envelope to
 * @param startTime - When to start the envelope (in seconds)
 * @param duration - Total duration of the sound (in seconds)
 * @param attackTime - How long the attack phase should last (in seconds)
 * @param releaseTime - How long the release phase should last (in seconds)
 */
export function createEnvelope(
  gainNode: GainNode,
  startTime: number,
  duration: number,
  attackTime: number = 0.015,
  releaseTime: number = 0.015,
): void {
  // Ensure the envelope fits within the duration
  const maxAttackRelease = duration * 0.8;
  const actualAttack = Math.min(attackTime, maxAttackRelease / 2);
  const actualRelease = Math.min(releaseTime, maxAttackRelease / 2);

  // Calculate the release start time
  const releaseStart = startTime + duration - actualRelease;

  // Apply attack (fade in)
  fadeIn(gainNode.gain, 0, 1, startTime, actualAttack);

  // Apply release (fade out)
  fadeOut(gainNode.gain, 1, 0, releaseStart, actualRelease);
}
