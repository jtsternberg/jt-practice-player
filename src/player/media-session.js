/**
 * Media Session adapter.
 *
 * Isolates all interaction with the browser Media Session API so the player can
 * expose rich lock-screen / CarPlay metadata and controls without coupling
 * transport logic to a global. Action registration is best-effort: one
 * unsupported action must never prevent the remaining actions from registering.
 */

/**
 * Resolve the album/collection label using the documented fallback order:
 * explicit playlist title, then the track's own album, then the document title.
 *
 * @param {string} playlistTitle Configured playlist title.
 * @param {string} trackAlbum    Track album metadata.
 * @param {string} documentTitle Current document title.
 * @return {string} The resolved album label, or an empty string.
 */
export function resolveAlbum( playlistTitle, trackAlbum, documentTitle ) {
	return playlistTitle?.trim() || trackAlbum?.trim() || documentTitle || '';
}

/**
 * Create a Media Session adapter bound to a `mediaSession` implementation and a
 * `MediaMetadata` constructor (both injectable for testing).
 *
 * @param {Object}   mediaSession      The navigator.mediaSession object.
 * @param {Function} MediaMetadataCtor The MediaMetadata constructor.
 * @return {Object} The adapter with bind/updateMetadata/updateState methods.
 */
export function createMediaSessionAdapter( mediaSession, MediaMetadataCtor ) {
	let getPlayer = () => null;
	const safely = ( callback ) => {
		try {
			callback();
		} catch {}
	};
	const player = () => getPlayer?.();
	return {
		bind( getter ) {
			getPlayer = getter;
			const actions = {
				play: () => player()?.play(),
				pause: () => player()?.pause(),
				previoustrack: () => player()?.previous(),
				nexttrack: () => player()?.next(),
				seekbackward: ( event ) =>
					player()?.seekBy( -( event.seekOffset ?? 15 ) ),
				seekforward: ( event ) =>
					player()?.seekBy( event.seekOffset ?? 15 ),
				seekto: ( event ) => player()?.seekTo( event.seekTime ),
				stop: () => player()?.stop(),
			};
			Object.entries( actions ).forEach( ( [ action, handler ] ) =>
				safely( () => mediaSession.setActionHandler( action, handler ) )
			);
		},
		updateMetadata( track, options, documentTitle ) {
			const artwork = track.artwork || options.siteIcon;
			mediaSession.metadata = new MediaMetadataCtor( {
				title: track.title || documentTitle || '',
				artist: track.artist || '',
				album: resolveAlbum(
					options.playlistTitle,
					track.album,
					documentTitle
				),
				artwork: artwork ? [ { src: artwork } ] : [],
			} );
		},
		updateState( { playing, duration, position, playbackRate } ) {
			mediaSession.playbackState = playing ? 'playing' : 'paused';
			if ( Number.isFinite( duration ) && duration > 0 ) {
				safely( () =>
					mediaSession.setPositionState( {
						duration,
						playbackRate: playbackRate || 1,
						position: Math.min(
							duration,
							Math.max( 0, position || 0 )
						),
					} )
				);
			}
		},
	};
}
