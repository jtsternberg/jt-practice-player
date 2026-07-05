import { __ } from '@wordpress/i18n';
import {
	useState,
	useRef,
	useEffect,
	useCallback,
	memo,
	Fragment,
} from '@wordpress/element';
import { useSelect } from '@wordpress/data';
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
} from '@wordpress/components';
import { dragHandle } from '@wordpress/icons';
import DebouncedText from '../../components/debounced-text';

// Shape appended when the author adds a manual external-URL track. Attachment
// tracks carry an `id`; external tracks never do, which is how rows and the
// PHP render layer tell them apart.
const NEW_EXTERNAL_TRACK = {
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
	const attachment = useSelect(
		( select ) => ( track.id ? select( 'core' ).getMedia( track.id ) : null ),
		[ track.id ]
	);
	const title = isExternal
		? track.title || track.url || __( 'External audio', 'jt-practice-player' )
		: track.customTitle ||
		  attachment?.title?.rendered ||
		  __( '(loading…)', 'jt-practice-player' );
	// Artist/duration for attachment tracks are derived server-side, so only
	// external tracks can show them in the editor preview.
	const artist = isExternal ? track.artist : '';
	const duration = isExternal ? track.duration : '';

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
				aria-label={ __( 'Drag to reorder track', 'jt-practice-player' ) }
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
	onRemove,
	onMove,
} ) {
	const isExternal = ! track.id;
	const attachment = useSelect(
		( select ) => ( track.id ? select( 'core' ).getMedia( track.id ) : null ),
		[ track.id ]
	);
	return (
		<>
			{ isExternal ? (
				<>
					<DebouncedText
						type="url"
						label={ __( 'Audio URL', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ track.url || '' }
						placeholder="https://…"
						onChange={ ( v ) => setField( index, 'url', v ) }
						help={
							urlLooksInvalid( track.url )
								? __(
										'This doesn’t look like a valid URL.',
										'jt-practice-player'
								  )
								: undefined
						}
					/>
					{ track.url && isCrossOrigin( track.url ) && (
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
						value={ track.title || '' }
						placeholder={ __( 'Song title', 'jt-practice-player' ) }
						onChange={ ( v ) => setField( index, 'title', v ) }
					/>
					<DebouncedText
						label={ __( 'Artist', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ track.artist || '' }
						onChange={ ( v ) => setField( index, 'artist', v ) }
					/>
					<DebouncedText
						label={ __( 'Album', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ track.album || '' }
						onChange={ ( v ) => setField( index, 'album', v ) }
					/>
					<DebouncedText
						label={ __( 'Duration', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ track.duration || '' }
						placeholder="3:42"
						onChange={ ( v ) => setField( index, 'duration', v ) }
					/>
					<DebouncedText
						type="url"
						label={ __( 'Artwork URL', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ track.artwork || '' }
						placeholder="https://…"
						onChange={ ( v ) => setField( index, 'artwork', v ) }
						help={
							urlLooksInvalid( track.artwork )
								? __(
										'This doesn’t look like a valid URL.',
										'jt-practice-player'
								  )
								: undefined
						}
					/>
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
		</>
	);
}

export default function Edit( { attributes, setAttributes } ) {
	const {
		tracks,
		showSkipButtons,
		showSpeedControl,
		showFullscreenControl,
		accentColor,
		loopColor,
		playheadColor,
	} = attributes;
	const containerRef = useRef( null );
	const [ drag, setDrag ] = useState( null );
	const [ selectedIndex, setSelectedIndex ] = useState( null );

	const tracksRef = useRef( tracks );
	tracksRef.current = tracks;

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
		>
			<InspectorControls>
				<PanelBody
					title={ __( 'Player options', 'jt-practice-player' ) }
					initialOpen
				>
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
						{ __(
							'Add external URL track',
							'jt-practice-player'
						) }
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
														{ __(
															'Done',
															'jt-practice-player'
														) }
													</Button>
												</div>
												<TrackSettings
													track={ track }
													index={ i }
													count={ tracks.length }
													setField={ setField }
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
