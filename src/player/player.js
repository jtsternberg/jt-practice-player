import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { createAudioTransport } from './audio-transport';
import { createMediaSessionAdapter } from './media-session';
import { timeFromPointer, waveformEligible, isAbortError } from './timeline';
import {
	buttonTargetHandlesKey,
	targetAcceptsText,
	shouldHandleGlobalSpace,
} from './keyboard';
import {
	loopJumpTarget,
	clampSeek,
	nextSpeed,
	nextPlaylistIndex,
	SPEED_STEPS,
	formatTime,
} from './loop-engine';
import { shouldStickPlayer } from './sticky';
import {
	loadTrackState,
	saveTrackState,
	loadSavedLoopsMap,
	saveSavedLoops,
	saveSavedLoopsMap,
	mergeSavedLoopMaps,
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
let mediaSessionAdapter = null;

// Body scroll lock for the fullscreen overlay-modal fallback. Ref-counted so
// nested/concurrent players restore the page's original overflow correctly.
let scrollLockCount = 0;
let scrollLockPrev = null;

function lockBodyScroll() {
	if ( scrollLockCount === 0 ) {
		scrollLockPrev = {
			html: document.documentElement.style.overflow,
			body: document.body.style.overflow,
		};
		document.documentElement.style.overflow = 'hidden';
		document.body.style.overflow = 'hidden';
	}
	scrollLockCount += 1;
}

function unlockBodyScroll() {
	if ( scrollLockCount === 0 ) {
		return;
	}
	scrollLockCount -= 1;
	if ( scrollLockCount === 0 && scrollLockPrev ) {
		document.documentElement.style.overflow = scrollLockPrev.html;
		document.body.style.overflow = scrollLockPrev.body;
		scrollLockPrev = null;
	}
}
const SAVE_DELAY = 1000;
const REGION_COLOR = 'rgba(214, 137, 42, 0.24)';
const WAVE_COLOR = '#9aa1aa';
const PROGRESS_COLOR = '#56616d';
const CURSOR_COLOR = '#d6422b';
const WAVEFORM_HEIGHT = 106;
const LOOP_CONTEXT_SECONDS = 5;
const ZOOM_STEP = 1.35;
const REPEAT_OFF = 'off';
const REPEAT_PLAYLIST = 'playlist';
const REPEAT_TRACK = 'track';
const AUDIO_CACHE_LIMIT = 10;
const SAVED_LOOP_LIMIT = 20;
const PEAK_CHANNELS = 2;
const PEAK_SAMPLES = 8000;
const PEAK_CACHE_LIMIT = 12;
const WAVEFORM_LOADING_DISMISS_DELAY = 1000;
const PEAK_CACHE = new Map();
const PEAK_PROMISES = new Map();

// Shareable deep-link support. A URL like
//   ?jtpp-track=<id|index>&jtpp-loop=<startSec>-<endSec>&jtpp-rate=<n>&jtpp-fs=1
// boots the player into fullscreen on that track, applies the loop as an
// active (unsaved) loop reconstructed entirely from the URL, and starts (or
// arms) playback — so a section can be co-practiced from a shared link.
// Consumed once per page load, by the first player that owns the track.
let shareParamsConsumed = false;
const SHARE_PARAM_TRACK = 'jtpp-track';
const SHARE_PARAM_LOOP = 'jtpp-loop';
const SHARE_PARAM_RATE = 'jtpp-rate';
const SHARE_PARAM_FS = 'jtpp-fs';

function roundShareTime( seconds ) {
	return Math.round( seconds * 100 ) / 100;
}

function parseShareLoop( value ) {
	if ( ! value ) {
		return null;
	}
	const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec( value.trim() );
	if ( ! match ) {
		return null;
	}
	const start = parseFloat( match[ 1 ] );
	const end = parseFloat( match[ 2 ] );
	if (
		! Number.isFinite( start ) ||
		! Number.isFinite( end ) ||
		end <= start
	) {
		return null;
	}
	return { start, end };
}

function parseShareRate( value ) {
	const rate = Number( value );
	return Number.isFinite( rate ) && rate > 0.1 && rate <= 4 ? rate : null;
}
const PLAY_ICON =
	'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>';
const PAUSE_ICON =
	'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5v14"></path><path d="M16 5v14"></path></svg>';
// Trash icon for the saved-cue delete control, drawn to match the stroke
// style of the transport icons above.
const TRASH_ICON =
	'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

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
		// Space toggles playback page-wide (like YouTube/Spotify), regardless
		// of where focus is — the button-target and text-input guards above
		// already carved out the cases where space must do something else.
		if ( shouldHandleGlobalSpace( event.target, event.key ) ) {
			event.preventDefault();
			activePlayer.togglePlay();
			return;
		}
		// Only claim keyboard shortcuts (arrows, space, etc.) when focus is
		// actually inside the player; otherwise let the key do its normal thing
		// (e.g. arrow keys scroll the page). Hardware media keys still work via
		// the Media Session API bound separately.
		const focusInPlayer =
			activePlayer.rootEl.contains( event.target ) ||
			activePlayer.rootEl.contains(
				event.target?.ownerDocument?.activeElement
			);
		if ( ! focusInPlayer ) {
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
	const MediaMetadataCtor =
		typeof window.MediaMetadata === 'function'
			? window.MediaMetadata
			: class {
					constructor( data ) {
						Object.assign( this, data );
					}
			  };
	mediaSessionAdapter = createMediaSessionAdapter(
		window.navigator.mediaSession,
		MediaMetadataCtor
	);
	// The adapter always routes through whichever player is currently active.
	mediaSessionAdapter.bind( () => activePlayer );
}

export class PracticePlayer {
	constructor( rootEl ) {
		this.rootEl = rootEl;
		this.rootEl.jtppPlayer = this;
		this.data = this.readData();
		this.tracks = this.normalizeTrackUrls( this.data.tracks || [] );
		this.options = this.data.options || {};
		this.userLoopCues = this.data.userLoopCues || null;
		this.storageTrackIds = this.tracks.map( ( track ) => track.id );
		this.savedLoopsByTrack = loadSavedLoopsMap( this.storageTrackIds );
		this.activeIndex = 0;
		this.dragIndex = null;
		this.loop = null;
		this.region = null;
		this.loopEditing = false;
		this.scrubbing = false;
		this.waveSurfer = null;
		this.regions = null;
		// Waveform data is only fetched/decoded for a visible, on-screen loop
		// edit session. Assume on-screen until the observer proves otherwise so
		// the very first Set loop click is never dropped on a timing race.
		this.intersecting = true;
		this.intersectionObserver = null;
		this.peakToken = 0;
		this.peakAbortController = null;
		this.zoomPxPerSec = 0;
		this.loopFocusZoomPxPerSec = 0;
		this.saveTimer = null;
		this.stickyFrame = null;
		this.nativeAudio = null;
		this.transport = null;
		this.transportUnbinders = [];
		this.audioByUrl = new Map();
		this.waveformReady = false;
		this.waveformLoadingTimer = null;
		this.trackStateRestored = false;
		this.restoring = false;
		this.checkedIds = loadQueue( this.storageTrackIds );
		this.volume = loadVolume();
		this.repeatMode = this.options.playlist ? REPEAT_OFF : null;
		this.randomMode = false;

		this.cacheElements();
		this.restoreOrder();
		this.bindControls();
		this.bindStickyPlayer();
		this.observeIntersection();
		this.restoreQueue();
		this.loadTrack( 0, false );
		this.hydrateUserSavedLoops();
		PLAYERS.add( this );
		activePlayer = activePlayer || this;
		bindGlobalKeyboard();
		this.applyShareParams();

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
		this.shellEl = this.rootEl.querySelector( '.jtpp-shell' );
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
		this.timelineEl = this.rootEl.querySelector( '.jtpp-timeline' );
		this.timelineProgressEl = this.rootEl.querySelector(
			'.jtpp-timeline-progress'
		);
		this.timelinePlayheadEl = this.rootEl.querySelector(
			'.jtpp-timeline-playhead'
		);
		this.loopHelpEl = this.rootEl.querySelector( '.jtpp-loop-help' );
		this.loopEditButton = this.rootEl.querySelector( '.jtpp-loop-edit' );
		this.loopEditDoneButton = this.rootEl.querySelector(
			'.jtpp-loop-edit-done'
		);
		this.fallbackEl = this.rootEl.querySelector( '.jtpp-fallback' );
		this.panelEl = this.rootEl.querySelector( '.jtpp-panel' );
		this.controlsEl = this.rootEl.querySelector( '.jtpp-controls' );
		this.nowPlayingEl = this.rootEl.querySelector( '.jtpp-now-playing' );
		this.nowTitleEl = this.rootEl.querySelector( '.jtpp-now-title' );
		this.nowMetaEl = this.rootEl.querySelector( '.jtpp-now-meta' );
		this.artworkEl = this.rootEl.querySelector( '.jtpp-artwork' );
		this.artworkGlowEl = this.rootEl.querySelector( '.jtpp-artwork-glow' );
		this.currentTimeEl = this.rootEl.querySelector( '.jtpp-time-current' );
		this.totalTimeEl = this.rootEl.querySelector( '.jtpp-time-total' );
		this.playButton = this.rootEl.querySelector( '.jtpp-play' );
		this.repeatButton = this.rootEl.querySelector( '.jtpp-repeat' );
		this.randomButton = this.rootEl.querySelector( '.jtpp-random' );
		this.fullscreenButton = this.rootEl.querySelector( '.jtpp-fullscreen' );
		this.loopToolsEl = this.rootEl.querySelector( '.jtpp-loop-tools' );
		this.loopCurrentEl = this.rootEl.querySelector( '.jtpp-loop-current' );
		this.loopSavedEl = this.rootEl.querySelector( '.jtpp-loop-saved' );
		this.loopRangeEl = this.rootEl.querySelector( '.jtpp-loop-range' );
		this.loopCuesEl = this.rootEl.querySelector( '.jtpp-loop-cues' );
		this.loopSaveEditorEl = this.rootEl.querySelector(
			'.jtpp-loop-save-editor'
		);
		this.loopNameInput = this.rootEl.querySelector( '.jtpp-loop-name' );
		this.loopSaveButton = this.rootEl.querySelector( '.jtpp-loop-save' );
		this.loopSaveRangeEl = this.rootEl.querySelector(
			'.jtpp-loop-save-range'
		);
		this.loopSaveConfirmButton = this.rootEl.querySelector(
			'.jtpp-loop-save-confirm'
		);
		this.loopSaveCancelButton = this.rootEl.querySelector(
			'.jtpp-loop-save-cancel'
		);
		this.loopClearButton = this.rootEl.querySelector( '.jtpp-loop-clear' );
		this.zoomOutButton = this.rootEl.querySelector( '.jtpp-zoom-out' );
		this.zoomResetButton = this.rootEl.querySelector( '.jtpp-zoom-reset' );
		this.zoomInButton = this.rootEl.querySelector( '.jtpp-zoom-in' );
		this.speedSelect = this.rootEl.querySelector( '.jtpp-speed' );
		this.volumeInput = this.rootEl.querySelector( '.jtpp-volume' );
	}

	bindControls() {
		this.playButton?.addEventListener( 'click', () => this.togglePlay() );
		this.repeatButton?.addEventListener( 'click', () =>
			this.toggleRepeatMode()
		);
		this.randomButton?.addEventListener( 'click', () =>
			this.toggleRandomMode()
		);
		this.fullscreenButton?.addEventListener( 'click', () =>
			this.toggleFullscreen()
		);
		this.loopClearButton?.addEventListener( 'click', () =>
			this.clearLoopRegion()
		);
		this.loopSaveButton?.addEventListener( 'click', () =>
			this.openLoopSaveEditor()
		);
		this.loopSaveConfirmButton?.addEventListener( 'click', () =>
			this.saveCurrentLoop()
		);
		this.loopSaveCancelButton?.addEventListener( 'click', () =>
			this.closeLoopSaveEditor()
		);
		this.loopNameInput?.addEventListener( 'keydown', ( event ) => {
			if ( event.key === 'Enter' ) {
				event.preventDefault();
				this.saveCurrentLoop();
			}
			if ( event.key === 'Escape' ) {
				event.preventDefault();
				this.closeLoopSaveEditor();
			}
		} );
		this.loopCuesEl?.addEventListener( 'click', ( event ) =>
			this.handleCueClick( event )
		);
		this.zoomOutButton?.addEventListener( 'click', () =>
			this.stepZoom( -1 )
		);
		this.zoomResetButton?.addEventListener( 'click', () =>
			this.focusLoopZoom()
		);
		this.zoomInButton?.addEventListener( 'click', () =>
			this.stepZoom( 1 )
		);
		this.speedSelect?.addEventListener( 'change', () => {
			this.applyRate( Number( this.speedSelect.value ) || 1 );
			this.scheduleSave();
		} );
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

		this.bindTimeline();

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
		this.reflectPlaybackModes();
		document.addEventListener( 'fullscreenchange', () =>
			this.reflectFullscreen()
		);
	}

	bindTimeline() {
		this.loopEditButton?.addEventListener( 'click', () =>
			this.enterLoopEditMode()
		);
		this.loopEditDoneButton?.addEventListener( 'click', () =>
			this.exitLoopEditMode()
		);
		if ( ! this.timelineEl ) {
			return;
		}
		this.timelineEl.addEventListener( 'pointerdown', ( event ) =>
			this.onTimelinePointerDown( event )
		);
		this.timelineEl.addEventListener( 'pointermove', ( event ) =>
			this.onTimelinePointerMove( event )
		);
		this.timelineEl.addEventListener( 'pointerup', ( event ) =>
			this.onTimelinePointerUp( event )
		);
		this.timelineEl.addEventListener( 'pointercancel', ( event ) =>
			this.onTimelinePointerUp( event )
		);
		this.timelineEl.addEventListener( 'keydown', ( event ) =>
			this.onTimelineKeyDown( event )
		);
	}

	onTimelinePointerDown( event ) {
		if ( ! this.transport ) {
			return;
		}
		this.scrubbing = true;
		this.timelineEl.setPointerCapture?.( event.pointerId );
		this.seekToPointer( event );
	}

	onTimelinePointerMove( event ) {
		if ( ! this.scrubbing ) {
			return;
		}
		this.seekToPointer( event );
	}

	onTimelinePointerUp( event ) {
		if ( ! this.scrubbing ) {
			return;
		}
		this.scrubbing = false;
		this.timelineEl.releasePointerCapture?.( event.pointerId );
	}

	seekToPointer( event ) {
		if ( ! this.transport ) {
			return;
		}
		const rect = this.timelineEl.getBoundingClientRect();
		const { duration } = this.transport.snapshot();
		this.seekTo( timeFromPointer( event.clientX, rect, duration ) );
	}

	onTimelineKeyDown( event ) {
		const handlers = {
			ArrowLeft: () => this.skip( event.shiftKey ? -15 : -5 ),
			ArrowRight: () => this.skip( event.shiftKey ? 15 : 5 ),
			Home: () => this.seekStart(),
			End: () => this.seekTo( this.transport?.snapshot().duration ?? 0 ),
		};
		const handler = handlers[ event.key ];
		if ( ! handler ) {
			return;
		}
		// Handle here and stop the document-level shortcut handler from
		// double-seeking while the timeline slider itself is focused.
		event.preventDefault();
		event.stopPropagation();
		handler();
	}

	enterLoopEditMode() {
		this.loopEditing = true;
		this.rootEl.classList.add( 'is-loop-editing' );
		if ( this.waveformEl ) {
			this.waveformEl.hidden = false;
		}
		if ( this.loopHelpEl ) {
			this.loopHelpEl.hidden = false;
		}
		if ( this.loopEditButton ) {
			this.loopEditButton.hidden = true;
		}
		if ( this.loopEditDoneButton ) {
			this.loopEditDoneButton.hidden = false;
		}
		// Only now — an explicit, visible request — is waveform work eligible.
		this.ensureWaveformForLoopEditing();
		if ( this.loop ) {
			this.focusLoopZoom();
		}
		this.requestStickyUpdate();
	}

	ensureWaveformForLoopEditing() {
		if (
			! this.loopEditing ||
			this.waveSurfer ||
			! this.transport ||
			! this.waveformEl
		) {
			return;
		}
		const eligible = waveformEligible( {
			visible: document.visibilityState === 'visible',
			intersecting: this.intersecting,
			loopEditing: this.loopEditing,
			current: true,
		} );
		if ( ! eligible ) {
			// Intent is recorded; retried on visibility/intersection change.
			return;
		}
		this.createWaveform( this.currentTrack() );
	}

	createWaveform( track ) {
		this.regions = RegionsPlugin.create();
		this.waveSurfer = WaveSurfer.create( {
			container: this.waveformEl,
			// Attach to the same native audio element that the transport owns
			// so playback and position stay unified across attachment.
			media: this.transport.audio,
			height: WAVEFORM_HEIGHT,
			normalize: true,
			waveColor: WAVE_COLOR,
			progressColor: PROGRESS_COLOR,
			cursorColor: CURSOR_COLOR,
			cursorWidth: 3,
			plugins: [ this.regions ],
		} );
		this.setWaveformLoading( true );
		this.regions.enableDragSelection( {
			color: REGION_COLOR,
			drag: true,
			resize: true,
			minLength: 0.2,
		} );
		this.bindWaveSurferEvents();
		// Reflect any loop that already exists for this track (restored or
		// created before the waveform was attached).
		this.hydrateLoopRegion();
		this.loadWaveformPeaks( track );
	}

	hydrateLoopRegion() {
		if ( ! this.loop || ! this.regions || this.region ) {
			return;
		}
		this.restoring = true;
		this.region = this.regions.addRegion( {
			start: this.loop.start,
			end: this.loop.end,
			color: REGION_COLOR,
			drag: true,
			resize: true,
			minLength: 0.2,
		} );
		this.attachRegionClear( this.region );
		this.restoring = false;
	}

	exitLoopEditMode() {
		this.loopEditing = false;
		this.rootEl.classList.remove( 'is-loop-editing' );
		if ( this.waveformEl ) {
			this.waveformEl.hidden = true;
		}
		if ( this.loopHelpEl ) {
			this.loopHelpEl.hidden = true;
		}
		if ( this.loopEditButton ) {
			this.loopEditButton.hidden = false;
		}
		if ( this.loopEditDoneButton ) {
			this.loopEditDoneButton.hidden = true;
		}
		this.requestStickyUpdate();
	}

	bindStickyPlayer() {
		if ( ! this.shellEl || ! this.panelEl || ! this.trackList ) {
			return;
		}
		this.shellEl.classList.add( 'has-sticky-player' );
		window.addEventListener( 'scroll', this.requestStickyUpdate, {
			passive: true,
		} );
		window.addEventListener( 'resize', this.requestStickyUpdate );
		this.requestStickyUpdate();
	}

	observeIntersection() {
		if ( typeof window.IntersectionObserver !== 'function' ) {
			return;
		}
		this.intersectionObserver = new window.IntersectionObserver(
			( entries ) => {
				this.intersecting = entries.some(
					( entry ) => entry.isIntersecting
				);
				if ( this.intersecting ) {
					// A deferred loop-edit intent can now be honored on-screen.
					this.ensureWaveformForLoopEditing();
				}
			}
		);
		this.intersectionObserver.observe( this.rootEl );
	}

	requestStickyUpdate = () => {
		if ( this.stickyFrame ) {
			return;
		}
		this.stickyFrame = window.requestAnimationFrame( () => {
			this.stickyFrame = null;
			this.updateStickyPlayer();
		} );
	};

	updateStickyPlayer() {
		if ( ! this.shellEl || ! this.panelEl || ! this.trackList ) {
			return;
		}
		const shellRect = this.shellEl.getBoundingClientRect();
		const listRect = this.trackList.getBoundingClientRect();
		const bottomGap = 10;
		const panelHeight = this.panelEl.offsetHeight;
		const viewportHeight = window.innerHeight;
		const shouldStick = shouldStickPlayer( {
			trackCount: this.trackRows.length,
			shellTop: shellRect.top,
			panelTop: listRect.bottom,
			panelHeight,
			viewportHeight,
			bottomGap,
		} );

		this.shellEl.style.setProperty(
			'--jtpp-sticky-left',
			`${ Math.max( 0, shellRect.left ) }px`
		);
		this.shellEl.style.setProperty(
			'--jtpp-sticky-width',
			`${ Math.max( 0, shellRect.width ) }px`
		);
		this.shellEl.style.setProperty(
			'--jtpp-sticky-height',
			`${ panelHeight }px`
		);
		this.shellEl.classList.toggle( 'is-player-stuck', shouldStick );
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
		// Changing tracks always returns to the compact timeline.
		this.exitLoopEditMode();
		this.activeIndex = index;
		this.loop = null;
		this.region = null;
		this.zoomPxPerSec = 0;
		this.loopFocusZoomPxPerSec = 0;
		this.waveformReady = false;
		this.trackStateRestored = false;
		// New request identity so stale peak responses are discarded.
		this.peakToken += 1;
		this.setFallbackMode( false );
		this.updateActiveTrack();
		this.reflectLoopTools();
		// Only the native audio transport and compact timeline are set up here;
		// WaveSurfer is deferred until an explicit, visible loop edit session.
		this.setupTransport( this.tracks[ index ], autoplay );
	}

	setupTransport( track, autoplay ) {
		this.nativeAudio = this.getTrackAudio( track );
		this.transport = createAudioTransport( this.nativeAudio );
		this.transport.setVolume( this.volume );
		this.bindTransportEvents();
		this.bindNativeAudioEvents( track, autoplay );
		if ( this.nativeAudio.readyState === 0 ) {
			this.nativeAudio.load();
		}
	}

	getTrackAudio( track ) {
		let audio = this.audioByUrl.get( track.url );
		if ( audio ) {
			this.audioByUrl.delete( track.url );
			this.audioByUrl.set( track.url, audio );
			return audio;
		}
		audio = document.createElement( 'audio' );
		audio.preload = 'auto';
		audio.src = track.url;
		this.audioByUrl.set( track.url, audio );
		this.trimAudioCache( track.url );
		return audio;
	}

	trimAudioCache( activeUrl ) {
		for ( const [ url, audio ] of this.audioByUrl ) {
			if ( this.audioByUrl.size <= AUDIO_CACHE_LIMIT ) {
				return;
			}
			if ( url === activeUrl ) {
				continue;
			}
			audio.pause();
			audio.removeAttribute( 'src' );
			audio.load();
			this.audioByUrl.delete( url );
		}
	}

	bindTransportEvents() {
		// Native audio is the single source of truth for transport events;
		// WaveSurfer only mirrors the same media element for display.
		this.transportUnbinders = [
			this.transport.on( 'play', () => this.onPlay() ),
			this.transport.on( 'pause', () => this.onPause() ),
			this.transport.on( 'timeupdate', () => this.onTimeUpdate() ),
			this.transport.on( 'ended', () => this.onFinish() ),
		];
	}

	bindWaveSurferEvents() {
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

	bindNativeAudioEvents( track, autoplay ) {
		const audio = this.nativeAudio;
		const restoreAndPlay = () => {
			if (
				this.currentTrack()?.url !== track.url ||
				this.nativeAudio !== audio
			) {
				return;
			}
			this.restoreTrackStateOnce();
			this.updateTimes();
			this.requestStickyUpdate();
			if ( autoplay ) {
				this.play();
			}
		};
		if ( this.nativeAudio.readyState >= 1 ) {
			restoreAndPlay();
			return;
		}
		this.nativeAudio.addEventListener( 'loadedmetadata', restoreAndPlay, {
			once: true,
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
		this.seekLoopStart();
		this.focusLoopZoom();
		this.reflectLoopTools();
		this.scheduleSave();
		this.requestStickyUpdate();
	}

	onRegionUpdated( region ) {
		if ( this.region !== region ) {
			return;
		}
		this.loop = {
			start: region.start,
			end: region.end,
			on: true,
		};
		this.seekLoopStart();
		this.focusLoopZoom();
		this.reflectLoopTools();
		this.scheduleSave();
		this.requestStickyUpdate();
	}

	onRegionRemoved( region ) {
		if ( this.region !== region ) {
			return;
		}
		this.region = null;
		this.loop = null;
		this.resetZoom();
		this.reflectLoopTools();
		this.scheduleSave();
		this.requestStickyUpdate();
	}

	attachRegionClear( region ) {
		const clear = document.createElement( 'button' );
		clear.type = 'button';
		clear.className = 'jtpp-region-clear';
		clear.tabIndex = -1;
		clear.textContent = '\u00d7';
		clear.setAttribute( 'aria-label', 'Clear loop region' );
		Object.assign( clear.style, {
			position: 'absolute',
			zIndex: '30',
			top: '5px',
			right: '5px',
			display: 'inline-flex',
			width: '20px',
			height: '20px',
			alignItems: 'center',
			justifyContent: 'center',
			padding: '0',
			border: '1px solid rgba(214, 137, 42, 0.5)',
			borderRadius: '999px',
			color: '#1f2933',
			fontSize: '16px',
			fontWeight: '700',
			lineHeight: '1',
			background: '#fff',
			opacity: '0',
			pointerEvents: 'none',
			boxShadow:
				'0 1px 2px rgba(0, 0, 0, 0.18), 0 0 0 2px rgba(255, 255, 255, 0.72)',
			cursor: 'pointer',
			transition: 'opacity 120ms ease, transform 120ms ease',
			transform: 'translateY(2px)',
		} );
		const setVisible = ( visible ) => {
			clear.style.opacity = visible ? '1' : '0';
			clear.style.pointerEvents = visible ? 'auto' : 'none';
			clear.style.transform = visible
				? 'translateY(0)'
				: 'translateY(2px)';
		};
		clear.addEventListener( 'click', ( event ) => {
			event.preventDefault();
			event.stopPropagation();
			this.clearLoopRegion();
		} );
		region.setContent( clear );
		const rootNode = clear.getRootNode();
		if (
			rootNode?.querySelector &&
			rootNode?.append &&
			! rootNode.querySelector( 'style[data-jtpp-region-clear]' )
		) {
			const style = document.createElement( 'style' );
			style.dataset.jtppRegionClear = 'true';
			style.textContent = `
				[part^="region "]:hover [part="region-content"] {
					opacity: 1 !important;
					pointer-events: auto !important;
					transform: translateY(0) !important;
				}
			`;
			rootNode.append( style );
		}
		const regionEl = clear.parentElement || region.element;
		[ 'pointerenter', 'mouseenter', 'mouseover', 'focusin' ].forEach(
			( eventName ) => {
				regionEl?.addEventListener( eventName, () =>
					setVisible( true )
				);
			}
		);
		[ 'pointerleave', 'mouseleave', 'mouseout', 'focusout' ].forEach(
			( eventName ) => {
				regionEl?.addEventListener( eventName, () =>
					setVisible( false )
				);
			}
		);
	}

	restoreTrackState() {
		const state = loadTrackState( this.currentTrack().id );
		if ( ! state ) {
			this.transport?.seekTo( 0 );
			this.applyRate( 1 );
			return;
		}

		if (
			Number.isFinite( state.loopStart ) &&
			Number.isFinite( state.loopEnd )
		) {
			// The loop lives on `this.loop` independent of any waveform region,
			// so it plays, toggles, and clears without loop edit mode. The
			// visual region is only added if the waveform already exists.
			this.loop = {
				start: state.loopStart,
				end: state.loopEnd,
				on: true,
			};
			this.hydrateLoopRegion();
		}

		this.applyRate( state.rate || 1 );
		if ( this.loop ) {
			this.transport?.seekTo(
				clampSeek( this.loop.start, this.transport.snapshot().duration )
			);
			this.focusLoopZoom();
		} else {
			this.transport?.seekTo( 0 );
		}
		this.reflectLoopTools();
		this.requestStickyUpdate();
	}

	restoreTrackStateOnce() {
		if (
			this.trackStateRestored ||
			( this.nativeAudio && this.nativeAudio.readyState < 1 )
		) {
			return;
		}
		this.trackStateRestored = true;
		this.restoreTrackState();
	}

	onTimeUpdate() {
		const time = this.transport ? this.transport.snapshot().position : 0;
		const target = loopJumpTarget( time, this.loop );
		if ( target !== null ) {
			this.transport?.seekTo( target );
			this.updateTimes();
			this.scheduleSave();
			this.syncMediaSessionState();
			return;
		}
		this.updateTimes();
		this.scheduleSave();
		this.syncMediaSessionState();
	}

	onPlay() {
		activePlayer = this;
		PLAYERS.forEach( ( player ) => {
			if ( player !== this ) {
				player.pause();
			}
		} );
		this.playButton?.classList.add( 'is-playing' );
		this.rootEl.classList.add( 'is-playing' );
		this.playButton?.setAttribute( 'aria-label', 'Pause' );
		if ( this.playButton ) {
			this.playButton.innerHTML = PAUSE_ICON;
		}
		this.syncMediaSession();
	}

	onPause() {
		this.flushState();
		this.playButton?.classList.remove( 'is-playing' );
		this.rootEl.classList.remove( 'is-playing' );
		this.playButton?.setAttribute( 'aria-label', 'Play' );
		if ( this.playButton ) {
			this.playButton.innerHTML = PLAY_ICON;
		}
		this.syncMediaSessionState();
	}

	onFinish() {
		if ( this.loop?.on && this.loop.start < this.loop.end ) {
			this.transport?.seekTo( this.loop.start );
			this.play();
			return;
		}
		if ( this.repeatMode === REPEAT_TRACK ) {
			this.seekStart();
			this.play();
			return;
		}
		this.advance( 1, true, this.repeatMode === REPEAT_PLAYLIST );
	}

	togglePlay() {
		if ( this.transport?.snapshot().playing ) {
			this.pause();
		} else {
			this.play();
		}
	}

	play() {
		this.transport?.play()?.catch( () => {
			// Browsers can reject play() when the click did not count as a
			// user gesture, especially in automation or strict autoplay modes.
		} );
	}

	pause() {
		this.transport?.pause();
	}

	// Media Session action surface: the adapter routes system controls
	// (lock screen, CarPlay, hardware keys) through these methods.
	previous() {
		this.advance( -1, true );
	}

	next() {
		this.advance( 1, true );
	}

	seekBy( seconds ) {
		this.skip( seconds );
	}

	seekTo( seconds ) {
		if ( ! this.transport ) {
			return;
		}
		this.transport.seekTo( seconds );
		this.updateTimes();
		this.scheduleSave();
	}

	stop() {
		this.pause();
	}

	syncMediaSession() {
		if ( ! mediaSessionAdapter || activePlayer !== this ) {
			return;
		}
		const track = this.currentTrack();
		if ( track ) {
			mediaSessionAdapter.updateMetadata(
				track,
				this.options,
				document.title
			);
		}
		this.syncMediaSessionState();
	}

	syncMediaSessionState() {
		if (
			! mediaSessionAdapter ||
			activePlayer !== this ||
			! this.transport
		) {
			return;
		}
		mediaSessionAdapter.updateState( this.transport.snapshot() );
	}

	toggleRepeatMode() {
		if ( ! this.options.playlist ) {
			return;
		}
		if ( this.repeatMode === REPEAT_OFF ) {
			this.repeatMode = REPEAT_PLAYLIST;
		} else if ( this.repeatMode === REPEAT_PLAYLIST ) {
			this.repeatMode = REPEAT_TRACK;
		} else {
			this.repeatMode = REPEAT_OFF;
		}
		this.reflectPlaybackModes();
	}

	toggleRandomMode() {
		if ( ! this.options.playlist ) {
			return;
		}
		this.randomMode = ! this.randomMode;
		this.reflectPlaybackModes();
	}

	toggleFullscreen() {
		if ( ! this.fullscreenButton ) {
			return;
		}
		// Already in the CSS overlay fallback → exit it.
		if ( this.fullscreenModal ) {
			this.exitFullscreenModal();
			return;
		}
		// Already in native fullscreen → exit it.
		if ( document.fullscreenElement === this.rootEl ) {
			document.exitFullscreen?.();
			return;
		}
		// Try native fullscreen first (desktop). Fall back to the overlay modal
		// when the API is unavailable (iOS Safari only fullscreens <video>) or
		// when the request rejects.
		const request = this.rootEl.requestFullscreen;
		if ( document.fullscreenEnabled && typeof request === 'function' ) {
			let result;
			try {
				result = request.call( this.rootEl );
			} catch ( err ) {
				this.enterFullscreenModal();
				return;
			}
			if ( result && typeof result.catch === 'function' ) {
				result.catch( () => this.enterFullscreenModal() );
			}
			return;
		}
		this.enterFullscreenModal();
	}

	// Class-driven fullscreen fallback: a fixed overlay that covers all site
	// chrome, used where the native Fullscreen API can't fullscreen this
	// element. Shares the .is-fullscreen styling with the native path.
	enterFullscreenModal() {
		if ( this.fullscreenModal ) {
			return;
		}
		this.fullscreenModal = true;
		const active = this.rootEl.ownerDocument.activeElement;
		this.fullscreenReturnFocus =
			active && typeof active.focus === 'function'
				? active
				: this.fullscreenButton;
		this.rootEl.classList.add( 'is-fullscreen-modal' );
		this.rootEl.setAttribute( 'role', 'dialog' );
		this.rootEl.setAttribute( 'aria-modal', 'true' );
		this.rootEl.setAttribute(
			'aria-label',
			'Practice player, full screen'
		);
		lockBodyScroll();
		this.reflectFullscreen();
		// Move focus into the modal so keyboard shortcuts (incl. Escape) and
		// screen readers land inside it. Full focus-trap cycling is deferred to
		// the a11y task (jt-practice-player-a9y.6).
		( this.fullscreenButton || this.rootEl ).focus?.();
	}

	exitFullscreenModal() {
		if ( ! this.fullscreenModal ) {
			return;
		}
		this.fullscreenModal = false;
		this.rootEl.classList.remove( 'is-fullscreen-modal' );
		this.rootEl.removeAttribute( 'role' );
		this.rootEl.removeAttribute( 'aria-modal' );
		this.rootEl.removeAttribute( 'aria-label' );
		unlockBodyScroll();
		this.reflectFullscreen();
		this.fullscreenReturnFocus?.focus?.();
		this.fullscreenReturnFocus = null;
	}

	// Build a shareable deep link that reconstructs the current view: track,
	// active loop (start/end), playback rate, and a fullscreen flag. Callable
	// directly (e.g. from the console or a future Share menu, task a9y.9).
	getShareUrl() {
		const url = new URL( window.location.href );
		url.search = '';
		url.hash = '';
		const params = url.searchParams;
		const track = this.currentTrack();
		if ( track ) {
			params.set( SHARE_PARAM_TRACK, String( track.id ) );
		}
		if ( this.loop && this.loop.on && this.loop.start < this.loop.end ) {
			params.set(
				SHARE_PARAM_LOOP,
				`${ roundShareTime( this.loop.start ) }-${ roundShareTime(
					this.loop.end
				) }`
			);
		}
		const rate = Number( this.speedSelect?.value ) || 1;
		if ( rate !== 1 ) {
			params.set( SHARE_PARAM_RATE, String( rate ) );
		}
		params.set( SHARE_PARAM_FS, '1' );
		return url.toString();
	}

	// Decode share params from the current URL and boot into the shared view.
	// Runs once per page load, claimed by the first player that owns the
	// referenced track. The URL loop overrides any saved state for that track.
	applyShareParams() {
		if ( shareParamsConsumed ) {
			return;
		}
		const params = new URLSearchParams( window.location.search );
		const trackParam = params.get( SHARE_PARAM_TRACK );
		const loopParam = params.get( SHARE_PARAM_LOOP );
		if ( trackParam === null && loopParam === null ) {
			return;
		}

		let index = -1;
		if ( trackParam !== null ) {
			index = this.tracks.findIndex(
				( track ) => String( track.id ) === trackParam
			);
			// Fall back to a numeric index when the id isn't found (e.g. a link
			// shared before ids were stable, or a hand-built URL).
			if ( index < 0 && /^\d+$/.test( trackParam ) ) {
				const numeric = Number( trackParam );
				if ( numeric >= 0 && numeric < this.tracks.length ) {
					index = numeric;
				}
			}
			// Track isn't in this player's list — let another player claim it.
			if ( index < 0 ) {
				return;
			}
		} else {
			// Loop-only link applies to the current track.
			index = this.activeIndex;
		}

		shareParamsConsumed = true;

		const loop = parseShareLoop( loopParam );
		const rate = parseShareRate( params.get( SHARE_PARAM_RATE ) );
		const wantFullscreen = params.get( SHARE_PARAM_FS ) !== '0';

		if ( index !== this.activeIndex ) {
			this.loadTrack( index, false );
		}

		// The shared view is authoritative: suppress the per-track saved-state
		// restore (which would otherwise seek to 0 / reset rate, or apply a
		// locally saved loop) so the URL-derived state always wins. This is set
		// synchronously — before the audio's loadedmetadata restore can fire.
		this.trackStateRestored = true;

		// Apply loop + rate + fullscreen immediately. Mobile browsers routinely
		// refuse to preload metadata until a gesture, so gating this on
		// loadedmetadata would strand the whole boot on exactly the devices we
		// care about. Only the seek genuinely needs a known duration, so it is
		// the one thing deferred (see seekWhenReady).
		if ( loop ) {
			this.loop = { start: loop.start, end: loop.end, on: true };
			this.hydrateLoopRegion();
			this.seekWhenReady( loop.start );
			this.focusLoopZoom();
		}
		if ( rate ) {
			this.applyRate( rate );
		}
		this.reflectLoopTools();
		this.updateTimes();
		this.requestStickyUpdate();
		if ( wantFullscreen ) {
			this.enterFullscreenModal();
		}
		this.armSharedPlayback();
	}

	// Seek to a target time as soon as the media duration is known. Setting
	// currentTime before metadata is unreliable, so defer to loadedmetadata
	// when the element hasn't loaded yet (e.g. before the first gesture-driven
	// play on mobile). The active loop keeps playback in range thereafter.
	seekWhenReady( time ) {
		const audio = this.nativeAudio;
		const doSeek = () => {
			if ( this.nativeAudio !== audio || ! this.transport ) {
				return;
			}
			const { duration } = this.transport.snapshot();
			this.transport.seekTo(
				duration ? clampSeek( time, duration ) : time
			);
			this.updateTimes();
		};
		if ( audio && audio.readyState >= 1 ) {
			doSeek();
		} else {
			audio?.addEventListener( 'loadedmetadata', doSeek, { once: true } );
		}
	}

	// Autoplay of audible media is blocked without a user gesture. Try to
	// play; if the browser refuses, surface a clear "tap to start" affordance
	// (CSS class + fullscreen hint) and start on the first interaction rather
	// than failing silently.
	armSharedPlayback() {
		const result = this.transport?.play();
		if ( result && typeof result.then === 'function' ) {
			result.catch( () => this.awaitGestureToPlay() );
		} else {
			this.awaitGestureToPlay();
		}
	}

	awaitGestureToPlay() {
		if ( this.pendingGesturePlay ) {
			return;
		}
		this.pendingGesturePlay = true;
		this.rootEl.classList.add( 'is-awaiting-gesture' );
		const start = () => {
			document.removeEventListener( 'pointerdown', start, true );
			document.removeEventListener( 'keydown', start, true );
			this.pendingGesturePlay = false;
			this.rootEl.classList.remove( 'is-awaiting-gesture' );
			this.play();
		};
		document.addEventListener( 'pointerdown', start, true );
		document.addEventListener( 'keydown', start, true );
	}

	reflectFullscreen() {
		const active =
			document.fullscreenElement === this.rootEl || this.fullscreenModal;
		this.rootEl.classList.toggle( 'is-fullscreen', active );
		this.fullscreenButton?.setAttribute(
			'aria-pressed',
			active ? 'true' : 'false'
		);
		this.fullscreenButton?.setAttribute(
			'aria-label',
			active ? 'Exit fullscreen' : 'Enter fullscreen'
		);
		this.requestStickyUpdate();
	}

	clearLoopRegion() {
		if ( this.region ) {
			// region-removed handling resets loop/zoom/tools.
			this.region.remove();
			return;
		}
		// No waveform region present; clear the loop state directly so loops can
		// be cleared without entering loop edit mode.
		if ( ! this.loop ) {
			return;
		}
		this.loop = null;
		this.resetZoom();
		this.reflectLoopTools();
		this.scheduleSave();
		this.requestStickyUpdate();
	}

	openLoopSaveEditor() {
		if ( ! this.loop || this.loop.end <= this.loop.start ) {
			return;
		}
		if ( this.loopSaveEditorEl ) {
			this.loopSaveEditorEl.hidden = false;
		}
		if ( this.loopNameInput ) {
			this.loopNameInput.value = '';
			this.loopNameInput.placeholder = this.defaultLoopName();
			this.loopNameInput.focus();
		}
		this.reflectLoopTools();
	}

	closeLoopSaveEditor() {
		if ( this.loopSaveEditorEl ) {
			this.loopSaveEditorEl.hidden = true;
		}
		if ( this.loopNameInput ) {
			this.loopNameInput.value = '';
		}
		this.requestStickyUpdate();
	}

	saveCurrentLoop() {
		if ( ! this.loop || this.loop.end <= this.loop.start ) {
			return;
		}
		const trackId = this.currentTrack().id;
		const now = Date.now();
		const name = this.loopNameInput?.value.trim() || this.defaultLoopName();
		const savedLoop = {
			id: String( now ),
			name,
			start: this.loop.start,
			end: this.loop.end,
			rate: this.transport?.snapshot().playbackRate || 1,
			updatedAt: now,
		};
		const loops = [
			savedLoop,
			...this.getSavedLoops( trackId ).filter(
				( loop ) => loop.name.toLowerCase() !== name.toLowerCase()
			),
		].slice( 0, SAVED_LOOP_LIMIT );
		this.setSavedLoops( trackId, loops );
		if ( this.loopNameInput ) {
			this.loopNameInput.value = '';
		}
		this.closeLoopSaveEditor();
		this.reflectLoopTools( savedLoop.id );
	}

	defaultLoopName() {
		if ( ! this.loop ) {
			return 'Saved cue';
		}
		return `${ formatTime( this.loop.start ) }-${ formatTime(
			this.loop.end
		) }`;
	}

	handleCueClick( event ) {
		const target = event.target;
		if ( ! target?.closest ) {
			return;
		}
		const restoreButton = target.closest( '.jtpp-loop-cue-restore' );
		if ( restoreButton ) {
			this.restoreSavedLoop( restoreButton.dataset.loopId );
			return;
		}
		const deleteButton = target.closest( '.jtpp-loop-cue-delete' );
		if ( deleteButton ) {
			this.deleteSavedLoop( deleteButton.dataset.loopId );
		}
	}

	restoreSavedLoop( id ) {
		if ( ! id ) {
			this.reflectLoopTools();
			return;
		}
		const savedLoop = this.getSavedLoops( this.currentTrack().id ).find(
			( loop ) => loop.id === id
		);
		if ( ! savedLoop ) {
			this.reflectLoopTools();
			return;
		}
		this.loop = {
			start: savedLoop.start,
			end: savedLoop.end,
			on: true,
		};
		// Restoring a cue works without loop edit mode; the visual region is
		// only (re)built when the waveform is already attached.
		if ( this.regions ) {
			this.restoring = true;
			this.region?.remove();
			this.region = this.regions.addRegion( {
				start: savedLoop.start,
				end: savedLoop.end,
				color: REGION_COLOR,
				drag: true,
				resize: true,
				minLength: 0.2,
			} );
			this.attachRegionClear( this.region );
			this.restoring = false;
		}
		this.applyRate( savedLoop.rate || 1 );
		this.seekLoopStart();
		this.focusLoopZoom();
		this.reflectLoopTools( id );
		this.scheduleSave();
		this.requestStickyUpdate();
	}

	deleteSavedLoop( id ) {
		if ( ! id ) {
			return;
		}
		const trackId = this.currentTrack().id;
		const loops = this.getSavedLoops( trackId ).filter(
			( loop ) => loop.id !== id
		);
		this.setSavedLoops( trackId, loops );
		this.reflectLoopTools();
	}

	getSavedLoops( trackId ) {
		return this.savedLoopsByTrack?.[ trackId ] || [];
	}

	setSavedLoops( trackId, loops ) {
		this.savedLoopsByTrack = {
			...this.savedLoopsByTrack,
			[ trackId ]: loops,
		};
		if ( ! loops.length ) {
			delete this.savedLoopsByTrack[ trackId ];
		}
		saveSavedLoops( trackId, loops );
		this.saveUserSavedLoops();
	}

	async hydrateUserSavedLoops() {
		if ( ! this.userLoopCues?.restUrl || ! this.userLoopCues?.nonce ) {
			return;
		}
		try {
			const response = await window.fetch( this.userLoopCues.restUrl, {
				credentials: 'same-origin',
				headers: {
					'X-WP-Nonce': this.userLoopCues.nonce,
				},
			} );
			if ( ! response.ok ) {
				return;
			}
			const data = await response.json();
			const localLoops = this.savedLoopsByTrack;
			const remoteLoops = mergeSavedLoopMaps(
				data?.cues || {},
				{},
				SAVED_LOOP_LIMIT
			);
			const mergedLoops = mergeSavedLoopMaps(
				remoteLoops,
				localLoops,
				SAVED_LOOP_LIMIT
			);
			this.savedLoopsByTrack = mergedLoops;
			saveSavedLoopsMap( this.savedLoopsByTrack );
			this.reflectLoopTools();
			const hasLocalChanges =
				JSON.stringify( mergedLoops ) !== JSON.stringify( remoteLoops );
			if ( hasLocalChanges ) {
				this.saveUserSavedLoops();
			}
		} catch {
			// User-meta cue sync is best-effort; localStorage remains usable.
		}
	}

	async saveUserSavedLoops() {
		if ( ! this.userLoopCues?.restUrl || ! this.userLoopCues?.nonce ) {
			return;
		}
		try {
			const response = await window.fetch( this.userLoopCues.restUrl, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': this.userLoopCues.nonce,
				},
				body: JSON.stringify( {
					cues: this.savedLoopsByTrack,
				} ),
			} );
			if ( response.ok ) {
				const data = await response.json();
				this.savedLoopsByTrack = mergeSavedLoopMaps(
					data?.cues || {},
					{},
					SAVED_LOOP_LIMIT
				);
				saveSavedLoopsMap( this.savedLoopsByTrack );
				this.reflectLoopTools();
			}
		} catch {
			// Keep the local copy if the network or nonce fails.
		}
	}

	seekLoopStart() {
		if ( ! this.loop || ! this.transport ) {
			return;
		}
		this.transport.seekTo(
			clampSeek( this.loop.start, this.transport.snapshot().duration )
		);
		this.updateTimes();
	}

	focusLoopZoom() {
		if (
			! this.loop ||
			! this.waveSurfer ||
			! this.waveformEl ||
			! this.waveformReady
		) {
			return;
		}
		const duration = this.waveSurfer.getDuration();
		if ( ! Number.isFinite( duration ) || duration <= 0 ) {
			return;
		}
		const width = this.visibleWaveformWidth();
		if ( ! width ) {
			return;
		}
		const selectionStart = Math.max( 0, this.loop.start );
		const selectionEnd = Math.min( duration, this.loop.end );
		const visibleStart = Math.max(
			0,
			selectionStart - LOOP_CONTEXT_SECONDS
		);
		const visibleEnd = Math.min(
			duration,
			selectionEnd + LOOP_CONTEXT_SECONDS
		);
		const visibleDuration = Math.max( 1, visibleEnd - visibleStart );
		const fitZoom = Math.ceil( width / visibleDuration );
		const fullTrackZoom = Math.ceil( width / duration );
		this.loopFocusZoomPxPerSec = Math.max( fitZoom, fullTrackZoom + 1 );
		this.applyZoom( this.loopFocusZoomPxPerSec, visibleStart );
	}

	stepZoom( direction ) {
		if ( ! this.waveSurfer || ! this.waveformReady ) {
			return;
		}
		const duration = this.waveSurfer.getDuration();
		const width = this.visibleWaveformWidth();
		if ( ! duration || ! width ) {
			return;
		}
		const minZoom = Math.ceil( width / duration );
		const currentZoom =
			this.zoomPxPerSec || this.loopFocusZoomPxPerSec || minZoom;
		const nextZoom =
			direction > 0 ? currentZoom * ZOOM_STEP : currentZoom / ZOOM_STEP;
		this.applyZoom( Math.max( minZoom, nextZoom ) );
	}

	applyZoom( pxPerSec, scrollTime = null ) {
		if ( ! this.waveSurfer || ! this.waveformReady ) {
			return;
		}
		this.zoomPxPerSec = pxPerSec;
		this.waveSurfer.zoom( pxPerSec );
		window.requestAnimationFrame( () => this.centerZoom( scrollTime ) );
	}

	visibleWaveformWidth() {
		return Math.round(
			this.waveformEl?.getBoundingClientRect().width ||
				this.waveformEl?.offsetWidth ||
				0
		);
	}

	centerZoom( scrollTime = null ) {
		if ( ! this.waveSurfer ) {
			return;
		}
		if ( Number.isFinite( scrollTime ) ) {
			this.waveSurfer.setScrollTime( Math.max( 0, scrollTime ) );
			return;
		}
		const time = this.loop?.start ?? this.waveSurfer.getCurrentTime();
		this.waveSurfer.setScrollTime(
			Math.max( 0, time - LOOP_CONTEXT_SECONDS )
		);
	}

	resetZoom() {
		if ( ! this.waveSurfer || ! this.waveformReady ) {
			return;
		}
		this.zoomPxPerSec = 0;
		this.loopFocusZoomPxPerSec = 0;
		this.waveSurfer.zoom( 0 );
		this.waveSurfer.setScroll( 0 );
	}

	reflectLoopTools( selectedSavedLoop = '' ) {
		// A loop exists independently of any waveform region, so tools reflect
		// `this.loop` alone — loops stay toggleable/clearable without edit mode.
		const hasSelection = Boolean( this.loop );
		const savedLoops = this.currentTrack()
			? this.getSavedLoops( this.currentTrack().id )
			: [];
		if ( this.loopEditButton ) {
			// The entry label reflects whether a loop already exists; it never
			// changes the loop's on/off state.
			this.loopEditButton.textContent = hasSelection
				? 'Edit loop'
				: 'Set loop';
		}
		if ( this.loopToolsEl ) {
			this.loopToolsEl.hidden = ! hasSelection && savedLoops.length === 0;
		}
		if ( this.loopCurrentEl ) {
			this.loopCurrentEl.hidden = ! hasSelection;
		}
		if ( this.loopSaveEditorEl ) {
			this.loopSaveEditorEl.hidden =
				! hasSelection || this.loopSaveEditorEl.hidden;
		}
		if ( this.loopSavedEl ) {
			this.loopSavedEl.hidden = savedLoops.length === 0;
		}
		if ( this.loopClearButton ) {
			if ( hasSelection ) {
				this.loopClearButton.title = 'Clear current loop';
			}
		}
		if ( this.loopRangeEl && hasSelection ) {
			this.loopRangeEl.textContent = `${ formatTime(
				this.loop.start
			) }-${ formatTime( this.loop.end ) }`;
		}
		if ( this.loopSaveRangeEl && hasSelection ) {
			this.loopSaveRangeEl.textContent = `${ formatTime(
				this.loop.start
			) }-${ formatTime( this.loop.end ) }`;
		}
		if ( this.loopNameInput && hasSelection ) {
			this.loopNameInput.placeholder = this.defaultLoopName();
		}
		if ( this.loopCuesEl ) {
			const selected = selectedSavedLoop || '';
			this.loopCuesEl.textContent = '';
			savedLoops.forEach( ( loop ) => {
				const row = document.createElement( 'div' );
				row.className = 'jtpp-loop-cue';
				if ( loop.id === selected ) {
					row.classList.add( 'is-active' );
				}

				const copy = document.createElement( 'div' );
				copy.className = 'jtpp-loop-cue-copy';

				const name = document.createElement( 'strong' );
				name.textContent = loop.name;
				copy.append( name );

				const meta = document.createElement( 'small' );
				meta.textContent =
					loop.rate && loop.rate !== 1
						? `${ loop.rate }x playback`
						: 'Auto-loops when restored';
				copy.append( meta );

				const range = document.createElement( 'span' );
				range.className = 'jtpp-loop-cue-range';
				range.textContent = `${ formatTime(
					loop.start
				) }-${ formatTime( loop.end ) }`;

				const restore = document.createElement( 'button' );
				restore.type = 'button';
				restore.className = 'jtpp-loop-cue-restore';
				restore.dataset.loopId = loop.id;
				restore.textContent = 'Restore';
				restore.setAttribute(
					'aria-label',
					`Restore cue ${ loop.name }`
				);

				const deleteButton = document.createElement( 'button' );
				deleteButton.type = 'button';
				deleteButton.className = 'jtpp-loop-cue-delete';
				deleteButton.dataset.loopId = loop.id;
				deleteButton.innerHTML = TRASH_ICON;
				deleteButton.setAttribute(
					'aria-label',
					`Delete cue ${ loop.name }`
				);

				row.append( copy, range, restore, deleteButton );
				this.loopCuesEl.append( row );
			} );
		}
		this.requestStickyUpdate();
	}

	reflectPlaybackModes() {
		if ( this.repeatButton ) {
			const trackRepeat = this.repeatMode === REPEAT_TRACK;
			const playlistRepeat = this.repeatMode === REPEAT_PLAYLIST;
			this.repeatButton.classList.toggle( 'is-active', trackRepeat );
			this.repeatButton.classList.toggle(
				'is-playlist-repeat',
				playlistRepeat
			);
			this.repeatButton.classList.toggle(
				'is-track-repeat',
				trackRepeat
			);
			this.repeatButton.classList.toggle(
				'is-repeat-off',
				this.repeatMode === REPEAT_OFF
			);
			let label = 'Repeat off';
			if ( trackRepeat ) {
				label = 'Repeat current track';
			} else if ( playlistRepeat ) {
				label = 'Repeat whole playlist';
			}
			this.repeatButton.setAttribute( 'aria-label', label );
			this.repeatButton.setAttribute(
				'aria-pressed',
				this.repeatMode === REPEAT_OFF ? 'false' : 'true'
			);
			this.repeatButton.title = label;
		}
		if ( this.randomButton ) {
			this.randomButton.classList.toggle( 'is-active', this.randomMode );
			this.randomButton.setAttribute(
				'aria-pressed',
				this.randomMode ? 'true' : 'false'
			);
			this.randomButton.title = this.randomMode
				? 'Random order on'
				: 'Random order';
		}
	}

	cycleSpeed() {
		const current = this.transport?.snapshot().playbackRate || 1;
		const rate =
			current === SPEED_STEPS[ SPEED_STEPS.length - 1 ]
				? 1
				: nextSpeed( current, 1 );
		this.applyRate( rate );
		this.scheduleSave();
	}

	applyRate( rate ) {
		this.transport?.setRate( rate );
		if ( this.speedSelect ) {
			this.speedSelect.value = String( rate );
		}
	}

	setGlobalVolume( volume ) {
		PLAYERS.forEach( ( player ) => player.setVolume( volume ) );
		saveVolume( volume );
	}

	setVolume( volume ) {
		this.volume = Math.min( Math.max( volume, 0 ), 1 );
		this.transport?.setVolume( this.volume );
		if ( this.volumeInput ) {
			this.volumeInput.value = String( this.volume );
		}
	}

	skip( seconds ) {
		if ( ! this.transport ) {
			return;
		}
		const { position, duration } = this.transport.snapshot();
		this.transport.seekTo( clampSeek( position + seconds, duration ) );
		this.updateTimes();
		this.scheduleSave();
	}

	seekStart() {
		this.transport?.seekTo( 0 );
		this.updateTimes();
		this.scheduleSave();
	}

	advance( direction, autoplay, wrap = true ) {
		const nextIndex = this.nextQueuedIndex( direction, wrap );
		if ( nextIndex === null ) {
			return;
		}
		this.loadTrack( nextIndex, autoplay );
	}

	nextQueuedIndex( direction, wrap = true ) {
		return nextPlaylistIndex(
			this.tracks.map( ( track ) => track.id ),
			this.checkedIds,
			this.activeIndex,
			direction,
			this.randomMode,
			Math.random,
			wrap
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
		this.updateArtworkGlow( track );
		this.trackButtons.forEach( ( button, index ) => {
			const active = index === this.activeIndex;
			button.classList.toggle( 'is-active', active );
			this.trackRows[ index ]?.classList.toggle( 'is-active', active );
			if ( active ) {
				button.setAttribute( 'aria-current', 'true' );
			} else {
				button.removeAttribute( 'aria-current' );
			}
		} );
		this.syncMediaSession();
	}

	// Ambient artwork wash: a heavily-blurred, dimmed, scaled copy of the
	// current track's artwork suffuses the whole panel behind a dark scrim
	// (Apple Music / Spotify style). Pure CSS background-image, so it works with
	// cross-origin artwork; falls back to the flat card when a track has none.
	updateArtworkGlow( track ) {
		if ( ! this.artworkGlowEl || ! this.panelEl ) {
			return;
		}
		if ( track?.artwork ) {
			const safeUrl = String( track.artwork ).replace( /["\\]/g, '\\$&' );
			// A custom property inherits into ::before without the element
			// painting (and tiling) the image itself.
			this.artworkGlowEl.style.setProperty(
				'--jtpp-artwork-glow',
				`url("${ safeUrl }")`
			);
			this.panelEl.classList.add( 'has-artwork-glow' );
		} else {
			this.artworkGlowEl.style.removeProperty( '--jtpp-artwork-glow' );
			this.panelEl.classList.remove( 'has-artwork-glow' );
		}
	}

	updateTimes() {
		if ( ! this.transport ) {
			return;
		}
		const { position, duration } = this.transport.snapshot();
		if ( this.currentTimeEl ) {
			this.currentTimeEl.textContent = formatTime( position );
		}
		if ( this.totalTimeEl ) {
			this.totalTimeEl.textContent = formatTime( duration );
		}
		this.updateTimelineProgress( position, duration );
	}

	updateTimelineProgress( position, duration ) {
		if ( ! this.timelineEl ) {
			return;
		}
		const ratio =
			duration > 0
				? Math.min( 1, Math.max( 0, position / duration ) )
				: 0;
		this.timelineEl.style.setProperty( '--jtpp-progress', String( ratio ) );
		this.timelineEl.setAttribute( 'aria-valuemin', '0' );
		this.timelineEl.setAttribute(
			'aria-valuemax',
			String( Math.round( duration ) || 0 )
		);
		this.timelineEl.setAttribute(
			'aria-valuenow',
			String( Math.round( position ) || 0 )
		);
		this.timelineEl.setAttribute(
			'aria-valuetext',
			`${ formatTime( position ) } of ${ formatTime( duration ) }`
		);
	}

	onKeyDown( event ) {
		if ( buttonTargetHandlesKey( event.target, event.key ) ) {
			return;
		}

		const handlers = {
			' ': () => this.togglePlay(),
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
		// Escape exits loop edit mode only while it is active, so it stays out
		// of the way of native Escape behavior (e.g. exiting fullscreen). When
		// not editing a loop, Escape closes the overlay-modal fallback (native
		// fullscreen handles its own Escape via the browser).
		if ( this.loopEditing ) {
			handlers.Escape = () => this.exitLoopEditMode();
		} else if ( this.fullscreenModal ) {
			handlers.Escape = () => this.exitFullscreenModal();
		}
		const handler = handlers[ event.key ];
		if ( handler ) {
			event.preventDefault();
			handler();
		}
	}

	stepSpeed( direction ) {
		const current = this.transport?.snapshot().playbackRate || 1;
		this.applyRate( nextSpeed( current, direction ) );
		this.scheduleSave();
	}

	scheduleSave() {
		window.clearTimeout( this.saveTimer );
		this.saveTimer = window.setTimeout( this.flushState, SAVE_DELAY );
	}

	flushState = () => {
		window.clearTimeout( this.saveTimer );
		if ( ! this.transport || ! this.currentTrack() ) {
			return;
		}
		saveTrackState( this.currentTrack().id, {
			loopStart: this.loop?.start,
			loopEnd: this.loop?.end,
			rate: this.transport.snapshot().playbackRate,
		} );
		saveVolume( this.volume );
	};

	onVisibilityChange = () => {
		if ( document.visibilityState === 'hidden' ) {
			this.flushState();
			// Never fetch/decode waveform data while backgrounded.
			this.abortPeakRequest();
			return;
		}
		// Back in the foreground: honor any pending loop-edit intent.
		this.ensureWaveformForLoopEditing();
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

	setWaveformLoading( loading ) {
		if ( ! this.waveformEl ) {
			return;
		}
		this.clearWaveformLoadingTimer();
		this.waveformEl.classList.remove( 'is-unavailable' );
		if ( loading ) {
			this.waveformEl.classList.add( 'is-loading' );
			this.waveformEl.dataset.status = 'Loading waveform';
			return;
		}
		const waveformEl = this.waveformEl;
		this.waveformLoadingTimer = window.setTimeout( () => {
			if ( this.waveformEl !== waveformEl ) {
				return;
			}
			this.waveformLoadingTimer = null;
			waveformEl.classList.remove( 'is-loading' );
			if ( ! waveformEl.classList.contains( 'is-unavailable' ) ) {
				waveformEl.dataset.status = '';
			}
		}, WAVEFORM_LOADING_DISMISS_DELAY );
	}

	setWaveformUnavailable() {
		if ( ! this.waveformEl ) {
			return;
		}
		this.clearWaveformLoadingTimer();
		this.waveformEl.classList.remove( 'is-loading' );
		this.waveformEl.classList.add( 'is-unavailable' );
		this.waveformEl.dataset.status = 'Waveform unavailable';
	}

	clearWaveformLoadingTimer() {
		if ( ! this.waveformLoadingTimer ) {
			return;
		}
		window.clearTimeout( this.waveformLoadingTimer );
		this.waveformLoadingTimer = null;
	}

	async loadWaveformPeaks( track ) {
		const token = this.peakToken;
		const cached = PEAK_CACHE.get( track.url );
		if ( cached ) {
			this.applyWaveformPeaks( track, cached, token );
			return;
		}
		// One AbortController per pending request; supersede any in flight.
		this.abortPeakRequest();
		const controller = new AbortController();
		this.peakAbortController = controller;
		try {
			const peaks = await getTrackPeaks( track.url, controller.signal );
			this.applyWaveformPeaks( track, peaks, token );
		} catch ( error ) {
			// An abort is a cancellation (track change, hide, destroy, or a
			// superseding request), not a waveform failure.
			if ( isAbortError( error ) ) {
				return;
			}
			if (
				token === this.peakToken &&
				this.currentTrack()?.url === track.url
			) {
				this.setWaveformUnavailable();
			}
		} finally {
			if ( this.peakAbortController === controller ) {
				this.peakAbortController = null;
			}
		}
	}

	abortPeakRequest() {
		this.peakAbortController?.abort();
		this.peakAbortController = null;
	}

	applyWaveformPeaks( track, peaks, token ) {
		// Guard by both request token and URL so a stale/superseded response is
		// discarded rather than painted onto the current waveform.
		if (
			token !== this.peakToken ||
			this.currentTrack()?.url !== track.url ||
			! this.waveSurfer
		) {
			return;
		}
		this.waveformReady = true;
		this.waveSurfer.setOptions( {
			peaks: peaks.data,
			duration: peaks.duration,
		} );
		this.setWaveformLoading( false );
		if ( this.loop ) {
			this.focusLoopZoom();
		}
		this.updateTimes();
		this.requestStickyUpdate();
	}

	setFallbackMode( fallback ) {
		if ( this.waveformEl ) {
			// The waveform is only visible during an explicit loop edit session.
			this.waveformEl.hidden = fallback || ! this.loopEditing;
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
		this.clearWaveformLoadingTimer();
		// Cancel any in-flight peak fetch/decode for the outgoing track.
		this.abortPeakRequest();
		this.transportUnbinders.forEach( ( off ) => off() );
		this.transportUnbinders = [];
		this.nativeAudio?.pause();
		if ( this.waveSurfer ) {
			this.waveSurfer.destroy();
		}
		this.waveSurfer = null;
		this.regions = null;
		this.region = null;
		this.waveformReady = false;
		this.transport = null;
		this.nativeAudio = null;
		if ( this.waveformEl ) {
			this.waveformEl.textContent = '';
			this.waveformEl.classList.remove( 'is-loading', 'is-unavailable' );
			this.waveformEl.dataset.status = '';
		}
	}
}

async function getTrackPeaks( url, signal ) {
	if ( PEAK_CACHE.has( url ) ) {
		return PEAK_CACHE.get( url );
	}
	if ( PEAK_PROMISES.has( url ) ) {
		return PEAK_PROMISES.get( url );
	}
	const promise = fetchTrackPeaks( url, signal )
		.then( ( peaks ) => {
			cacheTrackPeaks( url, peaks );
			return peaks;
		} )
		.finally( () => PEAK_PROMISES.delete( url ) );
	PEAK_PROMISES.set( url, promise );
	return promise;
}

async function fetchTrackPeaks( url, signal ) {
	const response = await fetch( url, { signal } );
	if ( response.status >= 400 ) {
		throw new Error( `Failed to fetch ${ url }: ${ response.status }` );
	}
	const arrayBuffer = await response.arrayBuffer();
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	if ( ! AudioContextClass ) {
		throw new Error( 'AudioContext is not available' );
	}
	const audioContext = new AudioContextClass( { sampleRate: 8000 } );
	try {
		const decoded = await audioContext.decodeAudioData( arrayBuffer );
		return {
			data: extractPeaks( decoded ),
			duration: decoded.duration,
		};
	} finally {
		audioContext.close();
	}
}

function extractPeaks( audioBuffer ) {
	const channels = Math.min( audioBuffer.numberOfChannels, PEAK_CHANNELS );
	const length = Math.min( PEAK_SAMPLES, audioBuffer.length );
	return Array.from( { length: channels }, ( _value, channelIndex ) => {
		const data = audioBuffer.getChannelData( channelIndex );
		const step = data.length / length;
		return Array.from( { length }, ( _sample, index ) => {
			const start = Math.floor( index * step );
			const end = Math.min(
				data.length,
				Math.ceil( ( index + 1 ) * step )
			);
			let peak = 0;
			for ( let i = start; i < end; i++ ) {
				if ( Math.abs( data[ i ] ) > Math.abs( peak ) ) {
					peak = data[ i ];
				}
			}
			return peak;
		} );
	} );
}

function cacheTrackPeaks( url, peaks ) {
	PEAK_CACHE.delete( url );
	PEAK_CACHE.set( url, peaks );
	while ( PEAK_CACHE.size > PEAK_CACHE_LIMIT ) {
		PEAK_CACHE.delete( PEAK_CACHE.keys().next().value );
	}
}
