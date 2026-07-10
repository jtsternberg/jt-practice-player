/**
 * Native audio transport.
 *
 * Wraps a single `HTMLAudioElement` so the player can drive playback, seeking,
 * rate, and volume through one small surface, and observe playback purely from
 * native audio events. Making native audio the single source of truth keeps
 * transport behavior consistent whether or not a waveform is attached, and lets
 * playback continue through hidden/background/CarPlay track changes without any
 * waveform work.
 *
 * @param {HTMLAudioElement} audio The audio element to wrap.
 * @return {Object} The transport surface.
 */
export function createAudioTransport( audio ) {
	const clamp = ( value ) =>
		Math.min(
			Number.isFinite( audio.duration ) ? audio.duration : value,
			Math.max( 0, value )
		);
	return {
		audio,
		play: () => audio.play(),
		pause: () => audio.pause(),
		stop() {
			audio.pause();
			audio.currentTime = 0;
		},
		seekTo( seconds ) {
			if ( Number.isFinite( seconds ) ) {
				audio.currentTime = clamp( seconds );
			}
		},
		seekBy( seconds ) {
			this.seekTo( audio.currentTime + seconds );
		},
		setRate( rate ) {
			audio.playbackRate = rate;
		},
		setVolume( volume ) {
			audio.volume = volume;
		},
		snapshot: () => ( {
			playing: ! audio.paused,
			position: audio.currentTime || 0,
			duration: audio.duration || 0,
			playbackRate: audio.playbackRate || 1,
		} ),
		on( event, handler, options ) {
			audio.addEventListener( event, handler, options );
			return () => audio.removeEventListener( event, handler, options );
		},
		destroy() {
			audio.pause();
			audio.removeAttribute( 'src' );
			audio.load();
		},
	};
}
