import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import {
	loopJumpTarget,
	clampSeek,
	nextSpeed,
	SPEED_STEPS,
	formatTime,
} from './loop-engine';
import {
	loadTrackState,
	saveTrackState,
	loadQueue,
	saveQueue,
	loadOrder,
	saveOrder,
	loadVolume,
	saveVolume,
} from './persistence';

const PLAYERS = new Set();
let activePlayer = null;
let keyboardBound = false;
let mediaSessionBound = false;
const SAVE_DELAY = 1000;
const REGION_COLOR = 'rgba(63, 127, 95, 0.24)';
const PLAY_ICON =
	'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>';
const PAUSE_ICON =
	'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v14"></path><path d="M16 5v14"></path></svg>';

function buttonTargetHandlesKey( target, key ) {
	return target?.closest?.( 'button' ) && ( key === ' ' || key === 'Enter' );
}

function targetAcceptsText( target ) {
	return target?.closest?.(
		'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
	);
}

function bindGlobalKeyboard() {
	if ( keyboardBound ) {
		return;
	}
	keyboardBound = true;
	document.addEventListener( 'keydown', ( event ) => {
		const trackButton = event.target?.closest?.( '.jtpp-track' );
		if ( trackButton && event.key === ' ' ) {
			activePlayer =
				trackButton.closest( '[data-jtpp]' )?.jtppPlayer ||
				activePlayer;
			event.preventDefault();
			activePlayer?.togglePlay();
			return;
		}
		if (
			! activePlayer ||
			buttonTargetHandlesKey( event.target, event.key )
		) {
			return;
		}
		if ( targetAcceptsText( event.target ) ) {
			return;
		}
		activePlayer.onKeyDown( event );
	} );
	bindMediaSession();
}

function bindMediaSession() {
	if ( mediaSessionBound || ! ( 'mediaSession' in window.navigator ) ) {
		return;
	}
	mediaSessionBound = true;
	const actions = {
		play: () => activePlayer?.play(),
		pause: () => activePlayer?.pause(),
		previoustrack: () => activePlayer?.advance( -1, true ),
		nexttrack: () => activePlayer?.advance( 1, true ),
		seekbackward: () => activePlayer?.skip( -15 ),
		seekforward: () => activePlayer?.skip( 15 ),
	};
	Object.entries( actions ).forEach( ( [ action, handler ] ) => {
		try {
			window.navigator.mediaSession.setActionHandler( action, handler );
		} catch {
			// Unsupported media session actions can be ignored.
		}
	} );
}

export class PracticePlayer {
	constructor( rootEl ) {
		this.rootEl = rootEl;
		this.rootEl.jtppPlayer = this;
		this.data = this.readData();
		this.tracks = this.normalizeTrackUrls( this.data.tracks || [] );
		this.options = this.data.options || {};
		this.storageTrackIds = this.tracks.map( ( track ) => track.id );
		this.activeIndex = 0;
		this.dragIndex = null;
		this.loop = null;
		this.region = null;
		this.waveSurfer = null;
		this.regions = null;
		this.saveTimer = null;
		this.restoring = false;
		this.checkedIds = loadQueue( this.storageTrackIds );
		this.volume = loadVolume();

		this.cacheElements();
		this.restoreOrder();
		this.bindControls();
		this.restoreQueue();
		this.loadTrack( 0, false );
		PLAYERS.add( this );
		activePlayer = activePlayer || this;
		bindGlobalKeyboard();

		document.addEventListener(
			'visibilitychange',
			this.onVisibilityChange
		);
		window.addEventListener( 'pagehide', this.flushState );
	}

	readData() {
		const dataEl = this.rootEl.querySelector( '.jtpp-data' );
		try {
			return JSON.parse( dataEl?.textContent || '{}' );
		} catch {
			return {};
		}
	}

	normalizeTrackUrls( tracks ) {
		return tracks.map( ( track ) => {
			try {
				const url = new URL( track.url, window.location.href );
				if ( url.host === window.location.host ) {
					url.protocol = window.location.protocol;
				}
				const artwork = track.artwork
					? new URL( track.artwork, window.location.href )
					: null;
				if ( artwork && artwork.host === window.location.host ) {
					artwork.protocol = window.location.protocol;
				}
				return {
					...track,
					url: url.toString(),
					artwork: artwork ? artwork.toString() : track.artwork,
				};
			} catch {
				return track;
			}
		} );
	}

	cacheElements() {
		this.trackList = this.rootEl.querySelector( '.jtpp-tracklist' );
		this.trackRows = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-track-row' )
		);
		this.dragHandles = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-drag-handle' )
		);
		this.trackButtons = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-track' )
		);
		this.queueChecks = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-queue-check' )
		);
		this.waveformEl = this.rootEl.querySelector( '.jtpp-waveform' );
		this.fallbackEl = this.rootEl.querySelector( '.jtpp-fallback' );
		this.controlsEl = this.rootEl.querySelector( '.jtpp-controls' );
		this.nowPlayingEl = this.rootEl.querySelector( '.jtpp-now-playing' );
		this.nowTitleEl = this.rootEl.querySelector( '.jtpp-now-title' );
		this.nowMetaEl = this.rootEl.querySelector( '.jtpp-now-meta' );
		this.artworkEl = this.rootEl.querySelector( '.jtpp-artwork' );
		this.currentTimeEl = this.rootEl.querySelector( '.jtpp-time-current' );
		this.totalTimeEl = this.rootEl.querySelector( '.jtpp-time-total' );
		this.playButton = this.rootEl.querySelector( '.jtpp-play' );
		this.loopButton = this.rootEl.querySelector( '.jtpp-loop' );
		this.speedButton = this.rootEl.querySelector( '.jtpp-speed' );
		this.volumeInput = this.rootEl.querySelector( '.jtpp-volume' );
	}

	bindControls() {
		this.playButton?.addEventListener( 'click', () => this.togglePlay() );
		this.loopButton?.addEventListener( 'click', () => this.toggleLoop() );
		this.speedButton?.addEventListener( 'click', () => this.cycleSpeed() );
		this.rootEl
			.querySelector( '.jtpp-back15' )
			?.addEventListener( 'click', () => this.skip( -15 ) );
		this.rootEl
			.querySelector( '.jtpp-fwd15' )
			?.addEventListener( 'click', () => this.skip( 15 ) );
		this.rootEl
			.querySelector( '.jtpp-prev' )
			?.addEventListener( 'click', () => this.advance( -1, true ) );
		this.rootEl
			.querySelector( '.jtpp-next' )
			?.addEventListener( 'click', () => this.advance( 1, true ) );
		this.rootEl
			.querySelector( '.jtpp-start' )
			?.addEventListener( 'click', () => this.seekStart() );

		this.trackButtons.forEach( ( button ) => {
			button.addEventListener( 'click', () => {
				this.loadTrack( Number( button.dataset.index ), true );
			} );
		} );

		this.bindReordering();

		this.queueChecks.forEach( ( check ) => {
			check.addEventListener( 'change', () => {
				this.checkedIds = this.queueChecks
					.filter( ( item ) => item.checked )
					.map(
						( item ) =>
							this.tracks[ Number( item.dataset.index ) ].id
					);
				saveQueue( this.storageTrackIds, this.checkedIds );
			} );
		} );

		if ( this.volumeInput ) {
			this.volumeInput.value = String( this.volume );
			this.volumeInput.addEventListener( 'input', () => {
				this.setGlobalVolume( Number( this.volumeInput.value ) );
			} );
		}

		this.rootEl.addEventListener( 'pointerdown', () => {
			activePlayer = this;
		} );
		this.rootEl.addEventListener( 'focusin', () => {
			activePlayer = this;
		} );
	}

	bindReordering() {
		this.dragHandles.forEach( ( handle ) => {
			handle.addEventListener( 'dragstart', ( event ) => {
				this.dragIndex = Number( handle.dataset.index );
				this.trackRows[ this.dragIndex ]?.classList.add(
					'is-dragging'
				);
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData(
					'text/plain',
					String( this.dragIndex )
				);
			} );
			handle.addEventListener( 'dragend', () => this.clearDragState() );
		} );

		this.trackRows.forEach( ( row ) => {
			row.addEventListener( 'dragover', ( event ) => {
				if ( this.dragIndex === null ) {
					return;
				}
				event.preventDefault();
				row.classList.add( 'is-drop-target' );
				event.dataTransfer.dropEffect = 'move';
			} );
			row.addEventListener( 'dragleave', () => {
				row.classList.remove( 'is-drop-target' );
			} );
			row.addEventListener( 'drop', ( event ) => {
				event.preventDefault();
				const toIndex = Number( row.dataset.index );
				this.reorderTracks( this.dragIndex, toIndex );
				this.clearDragState();
			} );
		} );
	}

	clearDragState() {
		this.dragIndex = null;
		this.trackRows.forEach( ( row ) => {
			row.classList.remove( 'is-dragging', 'is-drop-target' );
		} );
	}

	restoreOrder() {
		if ( ! this.trackList || this.tracks.length < 2 ) {
			return;
		}
		const orderIds = loadOrder( this.storageTrackIds );
		const byId = new Map(
			this.tracks.map( ( track ) => [ track.id, track ] )
		);
		const rowById = new Map(
			this.tracks.map( ( track, index ) => [
				track.id,
				this.trackRows[ index ],
			] )
		);
		this.tracks = orderIds
			.map( ( id ) => byId.get( id ) )
			.filter( Boolean );
		this.trackRows = orderIds
			.map( ( id ) => rowById.get( id ) )
			.filter( Boolean );
		this.trackRows.forEach( ( row ) => this.trackList.appendChild( row ) );
		this.refreshTrackElements();
	}

	reorderTracks( from, to ) {
		if (
			from === null ||
			from === to ||
			from < 0 ||
			to < 0 ||
			from >= this.tracks.length ||
			to >= this.tracks.length
		) {
			return;
		}
		const activeTrackId = this.currentTrack()?.id;
		this.tracks.splice( to, 0, this.tracks.splice( from, 1 )[ 0 ] );
		this.trackRows.splice( to, 0, this.trackRows.splice( from, 1 )[ 0 ] );
		this.trackRows.forEach( ( row ) => this.trackList.appendChild( row ) );
		this.activeIndex = this.tracks.findIndex(
			( track ) => track.id === activeTrackId
		);
		saveOrder(
			this.storageTrackIds,
			this.tracks.map( ( track ) => track.id )
		);
		this.refreshTrackElements();
		this.restoreQueue();
		this.updateActiveTrack();
	}

	refreshTrackElements() {
		this.trackRows = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-track-row' )
		);
		this.dragHandles = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-drag-handle' )
		);
		this.trackButtons = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-track' )
		);
		this.queueChecks = Array.from(
			this.rootEl.querySelectorAll( '.jtpp-queue-check' )
		);
		this.trackRows.forEach( ( row, index ) => {
			row.dataset.index = String( index );
			row.querySelectorAll( '[data-index]' ).forEach( ( el ) => {
				el.dataset.index = String( index );
			} );
			const download = row.querySelector( '.jtpp-download' );
			if ( download && this.tracks[ index ]?.url ) {
				download.href = this.tracks[ index ].url;
			}
		} );
	}

	restoreQueue() {
		this.queueChecks.forEach( ( check ) => {
			const index = Number( check.dataset.index );
			check.checked = this.checkedIds.includes( this.tracks[ index ].id );
		} );
	}

	loadTrack( index, autoplay ) {
		if ( ! this.tracks[ index ] ) {
			return;
		}
		this.flushState();
		this.destroyWaveSurfer();
		this.activeIndex = index;
		this.loop = null;
		this.region = null;
		this.setFallbackMode( false );
		this.updateActiveTrack();
		this.createWaveSurfer( this.tracks[ index ], autoplay );
	}

	createWaveSurfer( track, autoplay ) {
		this.regions = RegionsPlugin.create();
		this.waveSurfer = WaveSurfer.create( {
			container: this.waveformEl,
			url: track.url,
			height: 88,
			normalize: true,
			waveColor: '#8a8f98',
			progressColor: '#3f7f5f',
			cursorColor: '#1f2933',
			plugins: [ this.regions ],
		} );
		this.waveSurfer.setVolume( this.volume );
		this.regions.enableDragSelection( {
			color: REGION_COLOR,
			drag: true,
			resize: true,
			minLength: 0.2,
		} );

		this.bindWaveSurferEvents( autoplay );
	}

	bindWaveSurferEvents( autoplay ) {
		this.waveSurfer.on( 'ready', () => {
			this.restoreTrackState();
			this.updateTimes();
			if ( autoplay ) {
				this.play();
			}
		} );
		this.waveSurfer.on( 'timeupdate', ( time ) =>
			this.onTimeUpdate( time )
		);
		this.waveSurfer.on( 'play', () => this.onPlay() );
		this.waveSurfer.on( 'pause', () => this.onPause() );
		this.waveSurfer.on( 'finish', () => this.onFinish() );
		this.waveSurfer.on( 'error', () => this.showFallback() );

		this.regions.on( 'region-created', ( region ) =>
			this.onRegionCreated( region )
		);
		this.regions.on( 'region-updated', ( region ) =>
			this.onRegionUpdated( region )
		);
		this.regions.on( 'region-removed', ( region ) =>
			this.onRegionRemoved( region )
		);
		this.regions.on( 'region-double-clicked', ( region, event ) => {
			event.preventDefault();
			region.remove();
		} );
	}

	onRegionCreated( region ) {
		if ( this.restoring ) {
			this.region = region;
			this.attachRegionClear( region );
			return;
		}
		this.regions.getRegions().forEach( ( existing ) => {
			if ( existing !== region ) {
				existing.remove();
			}
		} );
		this.region = region;
		this.attachRegionClear( region );
		this.loop = { start: region.start, end: region.end, on: true };
		this.reflectLoop();
		this.scheduleSave();
	}

	onRegionUpdated( region ) {
		if ( this.region !== region ) {
			return;
		}
		this.loop = {
			start: region.start,
			end: region.end,
			on: this.loop?.on ?? true,
		};
		this.reflectLoop();
		this.scheduleSave();
	}

	onRegionRemoved( region ) {
		if ( this.region !== region ) {
			return;
		}
		this.region = null;
		this.loop = null;
		this.reflectLoop();
		this.scheduleSave();
	}

	attachRegionClear( region ) {
		const clear = document.createElement( 'button' );
		clear.type = 'button';
		clear.className = 'jtpp-region-clear';
		clear.textContent = 'x';
		clear.setAttribute( 'aria-label', 'Clear loop region' );
		clear.addEventListener( 'click', ( event ) => {
			event.preventDefault();
			event.stopPropagation();
			region.remove();
		} );
		region.setContent( clear );
	}

	restoreTrackState() {
		const state = loadTrackState( this.currentTrack().id );
		if ( ! state ) {
			this.applyRate( 1 );
			return;
		}

		this.restoring = true;
		if (
			Number.isFinite( state.loopStart ) &&
			Number.isFinite( state.loopEnd )
		) {
			this.region = this.regions.addRegion( {
				start: state.loopStart,
				end: state.loopEnd,
				color: REGION_COLOR,
				drag: true,
				resize: true,
				minLength: 0.2,
			} );
			this.loop = {
				start: state.loopStart,
				end: state.loopEnd,
				on: Boolean( state.loopOn ),
			};
			this.attachRegionClear( this.region );
		}
		this.restoring = false;

		this.applyRate( state.rate || 1 );
		if ( Number.isFinite( state.position ) ) {
			this.waveSurfer.setTime(
				clampSeek( state.position, this.waveSurfer.getDuration() )
			);
		}
		this.reflectLoop();
	}

	onTimeUpdate( time ) {
		const target = loopJumpTarget( time, this.loop );
		if ( target !== null ) {
			this.waveSurfer.setTime( target );
			return;
		}
		this.updateTimes();
		this.scheduleSave();
	}

	onPlay() {
		activePlayer = this;
		PLAYERS.forEach( ( player ) => {
			if ( player !== this ) {
				player.pause();
			}
		} );
		this.playButton?.classList.add( 'is-playing' );
		this.playButton?.setAttribute( 'aria-label', 'Pause' );
		if ( this.playButton ) {
			this.playButton.innerHTML = PAUSE_ICON;
		}
	}

	onPause() {
		this.flushState();
		this.playButton?.classList.remove( 'is-playing' );
		this.playButton?.setAttribute( 'aria-label', 'Play' );
		if ( this.playButton ) {
			this.playButton.innerHTML = PLAY_ICON;
		}
	}

	onFinish() {
		if ( this.loop?.on && this.loop.start < this.loop.end ) {
			this.waveSurfer.setTime( this.loop.start );
			this.play();
			return;
		}
		this.advance( 1, true );
	}

	togglePlay() {
		if ( this.waveSurfer?.isPlaying() ) {
			this.pause();
		} else {
			this.play();
		}
	}

	play() {
		this.waveSurfer?.play();
	}

	pause() {
		this.waveSurfer?.pause();
	}

	toggleLoop() {
		if ( ! this.loop || ! this.region ) {
			return;
		}
		this.loop = { ...this.loop, on: ! this.loop.on };
		this.reflectLoop();
		this.scheduleSave();
	}

	reflectLoop() {
		const active = Boolean( this.loop?.on && this.region );
		this.loopButton?.classList.toggle( 'is-active', active );
		this.loopButton?.setAttribute(
			'aria-pressed',
			active ? 'true' : 'false'
		);
	}

	cycleSpeed() {
		const current = this.waveSurfer?.getPlaybackRate?.() || 1;
		const rate =
			current === SPEED_STEPS[ 0 ] ? 1 : nextSpeed( current, -1 );
		this.applyRate( rate );
		this.scheduleSave();
	}

	applyRate( rate ) {
		this.waveSurfer?.setPlaybackRate( rate, true );
		if ( this.speedButton ) {
			this.speedButton.textContent = `${ rate }\u00d7`;
		}
	}

	setGlobalVolume( volume ) {
		PLAYERS.forEach( ( player ) => player.setVolume( volume ) );
		saveVolume( volume );
	}

	setVolume( volume ) {
		this.volume = Math.min( Math.max( volume, 0 ), 1 );
		this.waveSurfer?.setVolume( this.volume );
		if ( this.volumeInput ) {
			this.volumeInput.value = String( this.volume );
		}
	}

	skip( seconds ) {
		if ( ! this.waveSurfer ) {
			return;
		}
		this.waveSurfer.setTime(
			clampSeek(
				this.waveSurfer.getCurrentTime() + seconds,
				this.waveSurfer.getDuration()
			)
		);
		this.updateTimes();
		this.scheduleSave();
	}

	seekStart() {
		this.waveSurfer?.setTime( 0 );
		this.updateTimes();
		this.scheduleSave();
	}

	advance( direction, autoplay ) {
		const nextIndex = this.nextQueuedIndex( direction );
		if ( nextIndex === null ) {
			return;
		}
		this.loadTrack( nextIndex, autoplay );
	}

	nextQueuedIndex( direction ) {
		const checked = this.tracks
			.map( ( track, index ) =>
				this.checkedIds.includes( track.id ) ? index : null
			)
			.filter( ( index ) => index !== null );
		if ( checked.length === 0 ) {
			return null;
		}
		const currentPosition = checked.indexOf( this.activeIndex );
		if ( currentPosition !== -1 ) {
			return checked[
				( currentPosition + direction + checked.length ) %
					checked.length
			];
		}
		if ( direction > 0 ) {
			return (
				checked.find( ( index ) => index > this.activeIndex ) ??
				checked[ 0 ]
			);
		}
		return (
			[ ...checked ]
				.reverse()
				.find( ( index ) => index < this.activeIndex ) ??
			checked[ checked.length - 1 ]
		);
	}

	updateActiveTrack() {
		const track = this.currentTrack();
		if ( this.nowTitleEl ) {
			this.nowTitleEl.textContent = track.title;
		} else if ( this.nowPlayingEl ) {
			this.nowPlayingEl.textContent = track.title;
		}
		if ( this.nowMetaEl ) {
			this.nowMetaEl.textContent = [ track.artist, track.album ]
				.filter( Boolean )
				.join( ' · ' );
			this.nowMetaEl.hidden = ! this.nowMetaEl.textContent;
		}
		if ( this.artworkEl ) {
			if ( track.artwork ) {
				this.artworkEl.src = track.artwork;
				this.artworkEl.hidden = false;
			} else {
				this.artworkEl.removeAttribute( 'src' );
				this.artworkEl.hidden = true;
			}
		}
		this.trackButtons.forEach( ( button, index ) => {
			const active = index === this.activeIndex;
			button.classList.toggle( 'is-active', active );
			if ( active ) {
				button.setAttribute( 'aria-current', 'true' );
			} else {
				button.removeAttribute( 'aria-current' );
			}
		} );
	}

	updateTimes() {
		if ( ! this.waveSurfer ) {
			return;
		}
		if ( this.currentTimeEl ) {
			this.currentTimeEl.textContent = formatTime(
				this.waveSurfer.getCurrentTime()
			);
		}
		if ( this.totalTimeEl ) {
			this.totalTimeEl.textContent = formatTime(
				this.waveSurfer.getDuration()
			);
		}
	}

	onKeyDown( event ) {
		if ( buttonTargetHandlesKey( event.target, event.key ) ) {
			return;
		}

		const handlers = {
			' ': () => this.togglePlay(),
			l: () => this.toggleLoop(),
			L: () => this.toggleLoop(),
			ArrowLeft: () => this.skip( event.shiftKey ? -15 : -5 ),
			ArrowRight: () => this.skip( event.shiftKey ? 15 : 5 ),
			Home: () => this.seekStart(),
			ArrowUp: () => this.stepSpeed( 1 ),
			ArrowDown: () => this.stepSpeed( -1 ),
			MediaPlayPause: () => this.togglePlay(),
			MediaPlay: () => this.play(),
			MediaPause: () => this.pause(),
			MediaTrackPrevious: () => this.advance( -1, true ),
			MediaTrackNext: () => this.advance( 1, true ),
		};
		const handler = handlers[ event.key ];
		if ( handler ) {
			event.preventDefault();
			handler();
		}
	}

	stepSpeed( direction ) {
		const current = this.waveSurfer?.getPlaybackRate?.() || 1;
		this.applyRate( nextSpeed( current, direction ) );
		this.scheduleSave();
	}

	scheduleSave() {
		window.clearTimeout( this.saveTimer );
		this.saveTimer = window.setTimeout( this.flushState, SAVE_DELAY );
	}

	flushState = () => {
		window.clearTimeout( this.saveTimer );
		if ( ! this.waveSurfer || ! this.currentTrack() ) {
			return;
		}
		saveTrackState( this.currentTrack().id, {
			loopStart: this.loop?.start,
			loopEnd: this.loop?.end,
			loopOn: Boolean( this.loop?.on ),
			position: this.waveSurfer.getCurrentTime(),
			rate: this.waveSurfer.getPlaybackRate?.() || 1,
		} );
		saveVolume( this.volume );
	};

	onVisibilityChange = () => {
		if ( document.visibilityState === 'hidden' ) {
			this.flushState();
		}
	};

	showFallback() {
		this.setFallbackMode( true );
		if ( this.fallbackEl ) {
			this.fallbackEl.textContent = '';
			const message = document.createElement( 'p' );
			message.textContent =
				"Couldn't load waveform -- playing without it.";
			const audio = document.createElement( 'audio' );
			audio.controls = true;
			audio.src = this.currentTrack().url;
			this.fallbackEl.append( message, audio );
		}
	}

	setFallbackMode( fallback ) {
		if ( this.waveformEl ) {
			this.waveformEl.hidden = fallback;
		}
		if ( this.controlsEl ) {
			this.controlsEl.hidden = fallback;
		}
		if ( this.fallbackEl ) {
			this.fallbackEl.hidden = ! fallback;
		}
	}

	currentTrack() {
		return this.tracks[ this.activeIndex ];
	}

	destroyWaveSurfer() {
		if ( this.waveSurfer ) {
			this.waveSurfer.destroy();
		}
		if ( this.waveformEl ) {
			this.waveformEl.textContent = '';
		}
	}
}
