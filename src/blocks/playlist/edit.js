import { __, sprintf } from '@wordpress/i18n';
import {
	useState,
	useRef,
	useEffect,
	useCallback,
	memo,
	Fragment,
} from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import apiFetch from '@wordpress/api-fetch';
import {
	useBlockProps,
	MediaPlaceholder,
	MediaUpload,
	MediaUploadCheck,
	InspectorControls,
	PanelColorSettings,
} from '@wordpress/block-editor';
import {
	PanelBody,
	ToggleControl,
	Button,
	Flex,
	Notice,
	TextControl,
	Modal,
	TextareaControl,
} from '@wordpress/components';
import { dragHandle } from '@wordpress/icons';
import DebouncedText from '../../components/debounced-text';
import {
	canonicalFieldsFromTrack,
	hasCanonicalChanges,
	shouldSyncDraftWithBlockTrack,
	shouldEnableTrackSave,
} from './track-registry';

// Shape appended when the author adds a manual external-URL track. Attachment
// tracks carry an `id`; external tracks never do, which is how rows and the
// PHP render layer tell them apart.
const NEW_EXTERNAL_TRACK = {
	trackId: 0,
	url: '',
	title: '',
	artist: '',
	album: '',
	artwork: '',
	duration: '',
};

// Client-side shape warning only (per plan: never fetch remote URLs here).
function urlLooksInvalid( value ) {
	if ( ! value ) {
		return false;
	}
	try {
		// eslint-disable-next-line no-new
		new URL( value );
		return false;
	} catch ( e ) {
		return true;
	}
}

function isCrossOrigin( value ) {
	try {
		return new URL( value ).origin !== window.location.origin;
	} catch ( e ) {
		return false;
	}
}

// Inline colors so the preview reflects the block's color settings, matching
// what player_style_from_attributes() emits on the front end.
function previewStyle( { accentColor, loopColor, playheadColor } ) {
	const style = {};
	if ( accentColor ) {
		style[ '--jtpp-accent' ] = accentColor;
	}
	if ( loopColor ) {
		style[ '--jtpp-loop' ] = loopColor;
	}
	if ( playheadColor ) {
		style[ '--jtpp-playhead' ] = playheadColor;
	}
	return style;
}

// A single row in the front-end-styled preview list. Display only + drag +
// select; the actual editing lives in the sidebar. Memoized so typing/selecting
// doesn't re-render every row.
const PreviewRow = memo( function PreviewRow( {
	track,
	index,
	isSelected,
	onSelect,
	drag,
	startDrag,
} ) {
	const isExternal = ! track.id;
	const [ registryTrack, setRegistryTrack ] = useState( null );
	const attachment = useSelect(
		( select ) =>
			track.id ? select( 'core' ).getMedia( track.id ) : null,
		[ track.id ]
	);
	useEffect( () => {
		if ( ! track.trackId ) {
			setRegistryTrack( null );
			return undefined;
		}
		let cancelled = false;
		apiFetch( { path: `/jtpp/v1/tracks/${ track.trackId }` } )
			.then( ( response ) => {
				if ( ! cancelled ) {
					setRegistryTrack( response.track || null );
				}
			} )
			.catch( () => {
				if ( ! cancelled ) {
					setRegistryTrack( null );
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ track.trackId ] );
	const registryFields = registryTrack
		? canonicalFieldsFromTrack( registryTrack )
		: null;
	const title = isExternal
		? track.title ||
		  registryFields?.title ||
		  track.url ||
		  __( 'External audio', 'jt-practice-player' )
		: track.customTitle ||
		  attachment?.title?.rendered ||
		  __( '(loading…)', 'jt-practice-player' );
	// Artist/duration for attachment tracks are derived server-side, so only
	// external tracks can show them in the editor preview.
	const artist = isExternal ? track.artist || registryFields?.artist : '';
	const duration = isExternal
		? track.duration || registryFields?.duration
		: '';

	const isSource = drag && drag.from === index;
	const showAbove =
		drag &&
		drag.gap === index &&
		drag.from !== index &&
		drag.from !== index - 1;
	const showBelow =
		drag &&
		drag.gap === index + 1 &&
		drag.from !== index &&
		drag.from !== index + 1;

	return (
		<li
			className={ `jtpp-track-row jtpp-editor-preview-row${
				isSelected ? ' is-active' : ''
			}${ isSource ? ' is-dragging' : '' }${
				showAbove ? ' is-drop-above' : ''
			}${ showBelow ? ' is-drop-below' : '' }` }
		>
			<button
				type="button"
				className="jtpp-drag-handle"
				aria-label={ __(
					'Drag to reorder track',
					'jt-practice-player'
				) }
				onPointerDown={ ( event ) => startDrag( event, index, title ) }
			>
				{ dragHandle.props ? (
					<span className="jtpp-editor-grip">{ dragHandle }</span>
				) : null }
			</button>
			<span className="jtpp-editor-queue" aria-hidden="true" />
			<button
				type="button"
				className="jtpp-track"
				aria-pressed={ isSelected }
				onClick={ () => onSelect( index ) }
			>
				<span className="jtpp-track-copy">
					<span className="jtpp-track-title">{ title }</span>
					{ artist ? (
						<span className="jtpp-track-artist">{ artist }</span>
					) : null }
				</span>
				{ duration ? (
					<span className="jtpp-track-duration">{ duration }</span>
				) : null }
			</button>
			<span className="jtpp-download" aria-hidden="true">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
					<path
						d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</span>
		</li>
	);
} );

// Sidebar editor for whichever track is selected in the preview.
function TrackSettings( {
	track,
	index,
	count,
	setField,
	setTrack,
	onRemove,
	onMove,
} ) {
	const isExternal = ! track.id;
	const isRegistry = Boolean( track.trackId );
	const attachment = useSelect(
		( select ) =>
			track.id ? select( 'core' ).getMedia( track.id ) : null,
		[ track.id ]
	);
	const [ original, setOriginal ] = useState( null );
	const [ draft, setDraft ] = useState( track );
	const [ suggestions, setSuggestions ] = useState( [] );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ lyricsModalOpen, setLyricsModalOpen ] = useState( false );

	useEffect( () => {
		if ( ! shouldSyncDraftWithBlockTrack( track ) ) {
			return;
		}
		setDraft( track );
		setOriginal( null );
		setSuggestions( [] );
		setError( '' );
	}, [ track, track.trackId ] );

	useEffect( () => {
		if ( ! track.trackId ) {
			return undefined;
		}
		let cancelled = false;
		apiFetch( { path: `/jtpp/v1/tracks/${ track.trackId }` } )
			.then( ( response ) => {
				if ( cancelled || ! response.track ) {
					return;
				}
				const fields = canonicalFieldsFromTrack( response.track );
				setDraft( fields );
				setOriginal( fields );
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
	}, [ track.trackId ] );

	useEffect( () => {
		if ( ! isExternal || draft.trackId ) {
			return undefined;
		}
		const search = (
			draft.url ||
			[ draft.title, draft.artist, draft.album ]
				.filter( Boolean )
				.join( ' ' )
		).trim();
		if ( search.length < 3 ) {
			setSuggestions( [] );
			return undefined;
		}

		let cancelled = false;
		const timer = window.setTimeout( () => {
			apiFetch( {
				path: `/jtpp/v1/tracks?search=${ encodeURIComponent(
					search
				) }`,
			} )
				.then( ( response ) => {
					if ( ! cancelled ) {
						setSuggestions( response.tracks || [] );
					}
				} )
				.catch( () => {
					if ( ! cancelled ) {
						setSuggestions( [] );
					}
				} );
		}, 250 );

		return () => {
			cancelled = true;
			window.clearTimeout( timer );
		};
	}, [
		draft.album,
		draft.artist,
		draft.title,
		draft.trackId,
		draft.url,
		isExternal,
	] );

	const updateDraft = ( key, value ) => {
		const next = { ...draft, [ key ]: value };
		setDraft( next );
		if ( ! next.trackId ) {
			setField( index, key, value );
		}
	};

	const applyTrack = ( next ) => {
		const normalized = canonicalFieldsFromTrack( next );
		setDraft( normalized );
		setOriginal( normalized.trackId ? { ...normalized } : null );
		setTrack( index, {
			trackId: normalized.trackId,
			customTitle: track.customTitle || '',
		} );
		setSuggestions( [] );
	};

	const saveTrack = () => {
		setError( '' );
		if (
			draft.trackId &&
			hasCanonicalChanges( original, draft ) &&
			// eslint-disable-next-line no-alert
			! window.confirm(
				__(
					'Save changes to this shared track? This updates every playlist that uses it.',
					'jt-practice-player'
				)
			)
		) {
			return;
		}

		setSaving( true );
		apiFetch( {
			path: '/jtpp/v1/tracks',
			method: 'POST',
			data: draft,
		} )
			.then( ( response ) => {
				if ( response.track ) {
					applyTrack( response.track );
				}
			} )
			.catch( () => {
				setError(
					__(
						'Could not save the shared track.',
						'jt-practice-player'
					)
				);
			} )
			.finally( () => setSaving( false ) );
	};
	const registryLabel = isRegistry
		? sprintf(
				/* translators: %d: Shared track post ID. */
				__( 'Shared track #%d', 'jt-practice-player' ),
				track.trackId
		  )
		: __( 'Pending shared track', 'jt-practice-player' );
	const registryDescription = isRegistry
		? __(
				'Editing these fields changes this song everywhere it is used.',
				'jt-practice-player'
		  )
		: __(
				'Save this as a shared track to reuse it across players.',
				'jt-practice-player'
		  );
	const fallbackTrackLabel = ( trackId ) =>
		sprintf(
			/* translators: %d: Shared track post ID. */
			__( 'Track #%d', 'jt-practice-player' ),
			trackId
		);
	const suggestionLabel = ( suggestion ) =>
		suggestion.title ||
		suggestion.url ||
		fallbackTrackLabel( suggestion.trackId );

	return (
		<>
			{ isExternal ? (
				<>
					<div className="jtpp-editor-registry-status">
						<strong>{ registryLabel }</strong>
						<span>{ registryDescription }</span>
					</div>
					<DebouncedText
						type="url"
						label={ __( 'Audio URL', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ draft.url || '' }
						placeholder="https://…"
						onChange={ ( v ) => updateDraft( 'url', v ) }
						help={
							urlLooksInvalid( draft.url )
								? __(
										'This doesn’t look like a valid URL.',
										'jt-practice-player'
								  )
								: undefined
						}
					/>
					{ draft.url && isCrossOrigin( draft.url ) && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'Waveform loading depends on the remote host allowing browser audio fetches. If not, the player falls back to native audio controls.',
								'jt-practice-player'
							) }
						</Notice>
					) }
					<DebouncedText
						label={ __( 'Title', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ draft.title || '' }
						placeholder={ __( 'Song title', 'jt-practice-player' ) }
						onChange={ ( v ) => updateDraft( 'title', v ) }
					/>
					<DebouncedText
						label={ __( 'Artist', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ draft.artist || '' }
						onChange={ ( v ) => updateDraft( 'artist', v ) }
					/>
					<DebouncedText
						label={ __( 'Album', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ draft.album || '' }
						onChange={ ( v ) => updateDraft( 'album', v ) }
					/>
					<DebouncedText
						label={ __( 'Duration', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ draft.duration || '' }
						placeholder="3:42"
						onChange={ ( v ) => updateDraft( 'duration', v ) }
					/>
					<DebouncedText
						type="url"
						label={ __( 'Artwork URL', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ draft.artwork || '' }
						placeholder="https://…"
						onChange={ ( v ) => updateDraft( 'artwork', v ) }
						help={
							urlLooksInvalid( draft.artwork )
								? __(
										'This doesn’t look like a valid URL.',
										'jt-practice-player'
								  )
								: undefined
						}
					/>
					{ suggestions.length ? (
						<div className="jtpp-editor-suggestions">
							<strong>
								{ __(
									'Matching shared track found',
									'jt-practice-player'
								) }
							</strong>
							<p>
								{ __(
									'Use an existing shared track instead of creating a duplicate.',
									'jt-practice-player'
								) }
							</p>
							{ suggestions.map( ( suggestion ) => (
								<Button
									key={ suggestion.trackId }
									variant="secondary"
									onClick={ () => applyTrack( suggestion ) }
								>
									{ sprintf(
										/* translators: %s: Shared track title. */
										__( 'Use “%s”', 'jt-practice-player' ),
										suggestionLabel( suggestion )
									) }
								</Button>
							) ) }
						</div>
					) : null }
					{ error ? (
						<Notice status="error" isDismissible={ false }>
							{ error }
						</Notice>
					) : null }
					<Flex
						className="jtpp-editor-track-actions"
						justify="flex-start"
					>
						<Button
							variant="primary"
							disabled={
								saving ||
								! shouldEnableTrackSave( original, draft )
							}
							onClick={ saveTrack }
						>
							{ isRegistry
								? __(
										'Save shared track',
										'jt-practice-player'
								  )
								: __( 'Save track', 'jt-practice-player' ) }
						</Button>
					</Flex>
				</>
			) : (
				<>
					<DebouncedText
						label={ __( 'Title', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ track.customTitle || '' }
						placeholder={ attachment?.title?.rendered || '…' }
						onChange={ ( v ) =>
							setField( index, 'customTitle', v )
						}
					/>
					<p className="jtpp-editor-hint">
						{ __(
							'Media Library track. Artist and duration come from the file’s metadata on the front end.',
							'jt-practice-player'
						) }
					</p>
				</>
			) }
			<Flex className="jtpp-editor-track-actions" justify="flex-start">
				<Button
					variant="secondary"
					disabled={ index === 0 }
					onClick={ () => onMove( -1 ) }
				>
					{ __( 'Move up', 'jt-practice-player' ) }
				</Button>
				<Button
					variant="secondary"
					disabled={ index === count - 1 }
					onClick={ () => onMove( 1 ) }
				>
					{ __( 'Move down', 'jt-practice-player' ) }
				</Button>
				<Button variant="secondary" isDestructive onClick={ onRemove }>
					{ __( 'Remove', 'jt-practice-player' ) }
				</Button>
			</Flex>
			<Button
				variant="tertiary"
				className="jtpp-editor-lyrics-btn"
				onClick={ () => setLyricsModalOpen( true ) }
			>
				{ track.lyrics
					? __( 'Edit lyrics', 'jt-practice-player' )
					: __( 'Add lyrics', 'jt-practice-player' ) }
			</Button>
			{ lyricsModalOpen && (
				<Modal
					title={ __( 'Track lyrics', 'jt-practice-player' ) }
					onRequestClose={ () => setLyricsModalOpen( false ) }
					size="medium"
				>
					<TextareaControl
						label={ __(
							'Paste or type the lyrics below. They will be shown to listeners via a button on the player.',
							'jt-practice-player'
						) }
						__nextHasNoMarginBottom
						value={ track.lyrics || '' }
						rows={ 16 }
						onChange={ ( v ) => setField( index, 'lyrics', v ) }
					/>
					<Button
						variant="primary"
						onClick={ () => setLyricsModalOpen( false ) }
					>
						{ __( 'Done', 'jt-practice-player' ) }
					</Button>
				</Modal>
			) }
		</>
	);
}

export default function Edit( { attributes, setAttributes, clientId } ) {
	const {
		tracks,
		showSkipButtons,
		showSpeedControl,
		showFullscreenControl,
		playlistTitle,
		accentColor,
		loopColor,
		playheadColor,
	} = attributes;
	const containerRef = useRef( null );
	const [ drag, setDrag ] = useState( null );
	const [ selectedIndex, setSelectedIndex ] = useState( null );

	const tracksRef = useRef( tracks );
	tracksRef.current = tracks;

	// The canvas is all custom interactive controls, so clicking it doesn't
	// reliably select the block the way plain content does — which hides the
	// block's InspectorControls (player options/colors). Select it explicitly
	// on interaction so those panels stay available.
	const { selectBlock } = useDispatch( 'core/block-editor' );
	const isSelected = useSelect(
		( select ) =>
			select( 'core/block-editor' ).getSelectedBlockClientId() ===
			clientId,
		[ clientId ]
	);
	const ensureSelected = useCallback( () => {
		if ( clientId && ! isSelected ) {
			selectBlock( clientId );
		}
	}, [ clientId, isSelected, selectBlock ] );

	// Selecting a track reveals its inline editor below the preview. Editing
	// lives in the canvas (not the sidebar) because the block's canvas render
	// and its InspectorControls live in different contexts across the editor
	// iframe, which desyncs a shared selection.
	const selectTrack = useCallback(
		( i ) => setSelectedIndex( ( prev ) => ( prev === i ? null : i ) ),
		[]
	);

	const addMedia = useCallback(
		( media ) => {
			const additions = (
				Array.isArray( media ) ? media : [ media ]
			).map( ( m ) => ( { id: m.id, customTitle: '' } ) );
			setAttributes( {
				tracks: [ ...tracksRef.current, ...additions ],
			} );
		},
		[ setAttributes ]
	);
	const addExternal = useCallback( () => {
		const next = [ ...tracksRef.current, { ...NEW_EXTERNAL_TRACK } ];
		setAttributes( { tracks: next } );
		selectTrack( next.length - 1 );
	}, [ setAttributes, selectTrack ] );
	// Merge a single field against the latest track so debounced writes from
	// different fields of the same row can't clobber each other.
	const setField = useCallback(
		( i, key, value ) =>
			setAttributes( {
				tracks: tracksRef.current.map( ( t, n ) =>
					n === i ? { ...t, [ key ]: value } : t
				),
			} ),
		[ setAttributes ]
	);
	const setTrack = useCallback(
		( i, value ) =>
			setAttributes( {
				tracks: tracksRef.current.map( ( t, n ) =>
					n === i ? value : t
				),
			} ),
		[ setAttributes ]
	);
	const move = useCallback(
		( from, to ) => {
			const current = tracksRef.current;
			if (
				from === to ||
				from < 0 ||
				to < 0 ||
				from >= current.length ||
				to >= current.length
			) {
				return;
			}
			const next = [ ...current ];
			next.splice( to, 0, next.splice( from, 1 )[ 0 ] );
			setAttributes( { tracks: next } );
		},
		[ setAttributes ]
	);
	const remove = useCallback(
		( i ) => {
			setAttributes( {
				tracks: tracksRef.current.filter( ( _, n ) => n !== i ),
			} );
			setSelectedIndex( ( prev ) => {
				if ( prev === null ) {
					return prev;
				}
				if ( prev === i ) {
					return null;
				}
				return prev > i ? prev - 1 : prev;
			} );
		},
		[ setAttributes ]
	);

	// Which gap the pointer currently sits in, by comparing its Y against each
	// row's midpoint. Scoped to this block's rows only.
	const gapAt = useCallback( ( clientY ) => {
		const rows = containerRef.current
			? [
					...containerRef.current.querySelectorAll(
						'.jtpp-editor-preview-row'
					),
			  ]
			: [];
		for ( let i = 0; i < rows.length; i++ ) {
			const rect = rows[ i ].getBoundingClientRect();
			if ( clientY < rect.top + rect.height / 2 ) {
				return i;
			}
		}
		return rows.length;
	}, [] );

	const startDrag = useCallback( ( event, index, title ) => {
		if ( event.button && event.button !== 0 ) {
			return;
		}
		event.preventDefault();
		setDrag( {
			from: index,
			title,
			x: event.clientX,
			y: event.clientY,
			gap: index,
		} );
	}, [] );

	const dragging = drag !== null;
	useEffect( () => {
		if ( ! dragging ) {
			return undefined;
		}
		const doc = containerRef.current?.ownerDocument || document;
		const onMove = ( event ) => {
			setDrag( ( prev ) =>
				prev
					? {
							...prev,
							x: event.clientX,
							y: event.clientY,
							gap: gapAt( event.clientY ),
					  }
					: prev
			);
		};
		const onUp = () => {
			setDrag( ( prev ) => {
				if ( prev ) {
					const { from, gap } = prev;
					if ( gap !== from && gap !== from + 1 ) {
						const dest = from < gap ? gap - 1 : gap;
						move( from, dest );
						// Keep the selection on the track that was dragged.
						setSelectedIndex( dest );
					}
				}
				return null;
			} );
		};
		doc.addEventListener( 'pointermove', onMove );
		doc.addEventListener( 'pointerup', onUp );
		doc.addEventListener( 'pointercancel', onUp );
		return () => {
			doc.removeEventListener( 'pointermove', onMove );
			doc.removeEventListener( 'pointerup', onUp );
			doc.removeEventListener( 'pointercancel', onUp );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ dragging ] );

	return (
		<div
			{ ...useBlockProps( { className: 'jtpp-editor' } ) }
			ref={ containerRef }
			onPointerDownCapture={ ensureSelected }
			onMouseDownCapture={ ensureSelected }
			onFocusCapture={ ensureSelected }
		>
			<InspectorControls>
				<PanelBody
					title={ __( 'Player options', 'jt-practice-player' ) }
					initialOpen
				>
					<TextControl
						label={ __( 'Playlist title', 'jt-practice-player' ) }
						help={ __(
							'Shown in CarPlay, the lock screen, and other system media controls.',
							'jt-practice-player'
						) }
						value={ playlistTitle }
						onChange={ ( value ) =>
							setAttributes( { playlistTitle: value } )
						}
					/>
					<ToggleControl
						label={ __(
							'Show +/-15s skip buttons',
							'jt-practice-player'
						) }
						checked={ showSkipButtons }
						onChange={ ( v ) =>
							setAttributes( { showSkipButtons: v } )
						}
					/>
					<ToggleControl
						label={ __(
							'Show speed control',
							'jt-practice-player'
						) }
						checked={ showSpeedControl }
						onChange={ ( v ) =>
							setAttributes( { showSpeedControl: v } )
						}
					/>
					<ToggleControl
						label={ __(
							'Show fullscreen button',
							'jt-practice-player'
						) }
						checked={ showFullscreenControl }
						onChange={ ( v ) =>
							setAttributes( { showFullscreenControl: v } )
						}
					/>
				</PanelBody>
				<PanelColorSettings
					title={ __( 'Player colors', 'jt-practice-player' ) }
					initialOpen={ false }
					colorSettings={ [
						{
							label: __( 'Accent', 'jt-practice-player' ),
							value: accentColor,
							onChange: ( value ) =>
								setAttributes( { accentColor: value || '' } ),
						},
						{
							label: __( 'Loop selection', 'jt-practice-player' ),
							value: loopColor,
							onChange: ( value ) =>
								setAttributes( { loopColor: value || '' } ),
						},
						{
							label: __( 'Playhead', 'jt-practice-player' ),
							value: playheadColor,
							onChange: ( value ) =>
								setAttributes( { playheadColor: value || '' } ),
						},
					] }
				/>
			</InspectorControls>

			{ tracks.length === 0 ? (
				<>
					<MediaPlaceholder
						allowedTypes={ [ 'audio' ] }
						multiple
						labels={ {
							title: __(
								'Practice Playlist',
								'jt-practice-player'
							),
						} }
						onSelect={ addMedia }
					/>
					<Button
						className="jtpp-editor-add-external"
						variant="tertiary"
						onClick={ addExternal }
					>
						{ __( 'Add external URL track', 'jt-practice-player' ) }
					</Button>
				</>
			) : (
				<>
					<div
						className="jtpp jtpp-editor-preview"
						style={ previewStyle( {
							accentColor,
							loopColor,
							playheadColor,
						} ) }
					>
						<div className="jtpp-shell">
							<ol className="jtpp-tracklist">
								{ tracks.map( ( track, i ) => (
									<Fragment
										key={ `${ track.id || 'url' }-${ i }` }
									>
										<PreviewRow
											track={ track }
											index={ i }
											isSelected={ selectedIndex === i }
											onSelect={ selectTrack }
											drag={ drag }
											startDrag={ startDrag }
										/>
										{ selectedIndex === i && (
											<li className="jtpp-editor-drawer">
												<div className="jtpp-editor-drawer__head">
													<strong>
														{ __(
															'Edit track',
															'jt-practice-player'
														) }
														{ ` ${ i + 1 }` }
													</strong>
													<Button
														variant="tertiary"
														onClick={ () =>
															setSelectedIndex(
																null
															)
														}
													>
														{ track.id
															? __(
																	'Done',
																	'jt-practice-player'
															  )
															: __(
																	'Cancel',
																	'jt-practice-player'
															  ) }
													</Button>
												</div>
												<TrackSettings
													track={ track }
													index={ i }
													count={ tracks.length }
													setField={ setField }
													setTrack={ setTrack }
													onRemove={ () =>
														remove( i )
													}
													onMove={ ( dir ) => {
														const to = i + dir;
														move( i, to );
														setSelectedIndex( to );
													} }
												/>
											</li>
										) }
									</Fragment>
								) ) }
							</ol>
						</div>
					</div>
					{ drag && (
						<div
							className="jtpp-editor-ghost"
							style={ { top: drag.y, left: drag.x } }
							aria-hidden="true"
						>
							{ drag.title ||
								__( 'Track', 'jt-practice-player' ) }
						</div>
					) }
					<Flex
						className="jtpp-editor-actions"
						justify="flex-start"
						expanded={ false }
					>
						<MediaUploadCheck>
							<MediaUpload
								allowedTypes={ [ 'audio' ] }
								multiple
								onSelect={ addMedia }
								render={ ( { open } ) => (
									<Button
										variant="secondary"
										onClick={ open }
									>
										{ __(
											'Add tracks',
											'jt-practice-player'
										) }
									</Button>
								) }
							/>
						</MediaUploadCheck>
						<Button variant="tertiary" onClick={ addExternal }>
							{ __( 'Add external URL', 'jt-practice-player' ) }
						</Button>
					</Flex>
				</>
			) }
		</div>
	);
}
