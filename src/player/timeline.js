/**
 * Pure pointer-to-time and waveform eligibility helpers for the compact
 * timeline. These carry no DOM or transport dependencies so they can be tested
 * in isolation and reused by both normal scrubbing and loop edit gating.
 */

/**
 * Map a pointer's client X coordinate to a playback time, clamped to the
 * track's bounds.
 *
 * @param {number}                          clientX  Pointer client X coordinate.
 * @param {{ left: number, width: number }} rect     Timeline bounding rect.
 * @param {number}                          duration Track duration in seconds.
 * @return {number} Clamped time in seconds.
 */
export function timeFromPointer( clientX, rect, duration ) {
	if ( ! rect || rect.width <= 0 || ! ( duration > 0 ) ) {
		return 0;
	}
	const ratio = ( clientX - rect.left ) / rect.width;
	const clampedRatio = Math.min( 1, Math.max( 0, ratio ) );
	return clampedRatio * duration;
}

/**
 * Decide whether waveform work should run. Waveform data is only fetched or
 * decoded for an explicitly requested, visible, on-screen loop edit session on
 * the current track.
 *
 * @param {Object}  state              Eligibility inputs.
 * @param {boolean} state.visible      Page/document is visible (not backgrounded).
 * @param {boolean} state.intersecting Player is intersecting the viewport.
 * @param {boolean} state.loopEditing  User explicitly entered loop edit mode.
 * @param {boolean} state.current      Request matches the current track.
 * @return {boolean} Whether waveform work is eligible.
 */
export function waveformEligible( state ) {
	return Boolean(
		state &&
			state.visible &&
			state.intersecting &&
			state.loopEditing &&
			state.current
	);
}
