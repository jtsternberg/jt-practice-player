import { __ } from '@wordpress/i18n';
import { useEffect, useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import apiFetch from '@wordpress/api-fetch';
import {
	useBlockProps,
	MediaPlaceholder,
	InspectorControls,
	PanelColorSettings,
} from '@wordpress/block-editor';
import {
	PanelBody,
	ToggleControl,
	Button,
	ButtonGroup,
	Notice,
} from '@wordpress/components';
import DebouncedText from '../../components/debounced-text';
import {
	canonicalFieldsFromTrack,
	hasCanonicalChanges,
	shouldEnableTrackSave,
} from '../playlist/track-registry';

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

function SharedTrackEditor( { trackId, setAttributes } ) {
	const [ original, setOriginal ] = useState( null );
	const [ draft, setDraft ] = useState( {
		trackId: trackId || 0,
		url: '',
		title: '',
		artist: '',
		album: '',
		artwork: '',
		duration: '',
	} );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		if ( ! trackId ) {
			setOriginal( null );
			setDraft( {
				trackId: 0,
				url: '',
				title: '',
				artist: '',
				album: '',
				artwork: '',
				duration: '',
			} );
			return undefined;
		}

		let cancelled = false;
		apiFetch( { path: `/jtpp/v1/tracks/${ trackId }` } )
			.then( ( response ) => {
				if ( cancelled || ! response.track ) {
					return;
				}
				const fields = canonicalFieldsFromTrack( response.track );
				setOriginal( fields );
				setDraft( fields );
			} )
			.catch( () => {
				if ( ! cancelled ) {
					setError(
						__(
							'Could not load the shared track.',
							'jt-practice-player'
						)
					);
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ trackId ] );

	const updateDraft = ( key, value ) => {
		setDraft( ( current ) => ( { ...current, [ key ]: value } ) );
	};

	const saveTrack = () => {
		setError( '' );
		if (
			draft.trackId &&
			hasCanonicalChanges( original, draft ) &&
			// eslint-disable-next-line no-alert
			! window.confirm(
				__(
					'Save changes to this shared track? This updates every player that uses it.',
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
					const fields = canonicalFieldsFromTrack( response.track );
					setOriginal( fields );
					setDraft( fields );
					setAttributes( {
						trackId: fields.trackId,
						source: 'track',
					} );
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

	return (
		<div className="jtpp-editor-track jtpp-editor-track--external">
			<div className="jtpp-editor-track__fields">
				<p className="jtpp-editor-hint">
					{ trackId
						? __( 'Shared track', 'jt-practice-player' )
						: __( 'Pending shared track', 'jt-practice-player' ) }
				</p>
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
				<div className="jtpp-editor-track__meta">
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
				</div>
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
				{ error ? (
					<Notice status="error" isDismissible={ false }>
						{ error }
					</Notice>
				) : null }
				<Button
					variant="primary"
					disabled={
						saving || ! shouldEnableTrackSave( original, draft )
					}
					onClick={ saveTrack }
				>
					{ trackId
						? __( 'Save shared track', 'jt-practice-player' )
						: __( 'Save track', 'jt-practice-player' ) }
				</Button>
			</div>
		</div>
	);
}

export default function Edit( { attributes, setAttributes } ) {
	const {
		id,
		trackId,
		customTitle,
		source,
		externalUrl,
		externalTitle,
		externalArtist,
		externalAlbum,
		externalArtwork,
		externalDuration,
		showSkipButtons,
		showSpeedControl,
		showFullscreenControl,
		accentColor,
		loopColor,
		playheadColor,
	} = attributes;
	const attachment = useSelect(
		( select ) => ( id ? select( 'core' ).getMedia( id ) : null ),
		[ id ]
	);

	// Explicit choice wins; otherwise infer from existing data.
	let activeSource = 'media';
	if ( source ) {
		activeSource = source;
	} else if ( trackId ) {
		activeSource = 'track';
	} else if ( ! id && externalUrl ) {
		activeSource = 'external';
	}

	let trackEditor;
	if ( activeSource === 'track' ) {
		trackEditor = (
			<SharedTrackEditor
				trackId={ trackId }
				setAttributes={ setAttributes }
			/>
		);
	} else if ( activeSource === 'media' && ! id ) {
		trackEditor = (
			<MediaPlaceholder
				allowedTypes={ [ 'audio' ] }
				labels={ {
					title: __( 'Practice Track', 'jt-practice-player' ),
				} }
				onSelect={ ( media ) =>
					setAttributes( { id: media.id, trackId: 0 } )
				}
			/>
		);
	} else if ( activeSource === 'media' ) {
		trackEditor = (
			<div className="jtpp-editor-track">
				<div className="jtpp-editor-track__fields">
					<DebouncedText
						label={ __( 'Track title', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ customTitle }
						placeholder={
							attachment?.title?.rendered ||
							__( 'Loading…', 'jt-practice-player' )
						}
						onChange={ ( v ) =>
							setAttributes( { customTitle: v } )
						}
					/>
					<Button
						variant="secondary"
						onClick={ () =>
							setAttributes( {
								id: 0,
								trackId: 0,
								customTitle: '',
							} )
						}
					>
						{ __( 'Replace audio file', 'jt-practice-player' ) }
					</Button>
				</div>
			</div>
		);
	} else {
		trackEditor = (
			<div className="jtpp-editor-track jtpp-editor-track--external">
				<div className="jtpp-editor-track__fields">
					<DebouncedText
						type="url"
						label={ __( 'Audio URL', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ externalUrl }
						placeholder="https://…"
						onChange={ ( v ) =>
							setAttributes( { externalUrl: v } )
						}
						help={
							urlLooksInvalid( externalUrl )
								? __(
										'This doesn’t look like a valid URL.',
										'jt-practice-player'
								  )
								: undefined
						}
					/>
					{ externalUrl && isCrossOrigin( externalUrl ) && (
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
						value={ externalTitle }
						placeholder={ __( 'Song title', 'jt-practice-player' ) }
						onChange={ ( v ) =>
							setAttributes( { externalTitle: v } )
						}
					/>
					<div className="jtpp-editor-track__meta">
						<DebouncedText
							label={ __( 'Artist', 'jt-practice-player' ) }
							__nextHasNoMarginBottom
							value={ externalArtist }
							onChange={ ( v ) =>
								setAttributes( { externalArtist: v } )
							}
						/>
						<DebouncedText
							label={ __( 'Album', 'jt-practice-player' ) }
							__nextHasNoMarginBottom
							value={ externalAlbum }
							onChange={ ( v ) =>
								setAttributes( { externalAlbum: v } )
							}
						/>
						<DebouncedText
							label={ __( 'Duration', 'jt-practice-player' ) }
							__nextHasNoMarginBottom
							value={ externalDuration }
							placeholder="3:42"
							onChange={ ( v ) =>
								setAttributes( { externalDuration: v } )
							}
						/>
					</div>
					<DebouncedText
						type="url"
						label={ __( 'Artwork URL', 'jt-practice-player' ) }
						__nextHasNoMarginBottom
						value={ externalArtwork }
						placeholder="https://…"
						onChange={ ( v ) =>
							setAttributes( { externalArtwork: v } )
						}
						help={
							urlLooksInvalid( externalArtwork )
								? __(
										'This doesn’t look like a valid URL.',
										'jt-practice-player'
								  )
								: undefined
						}
					/>
				</div>
			</div>
		);
	}

	return (
		<div { ...useBlockProps( { className: 'jtpp-editor' } ) }>
			<InspectorControls>
				<PanelBody
					title={ __( 'Player options', 'jt-practice-player' ) }
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
								setAttributes( {
									playheadColor: value || '',
								} ),
						},
					] }
				/>
			</InspectorControls>

			<ButtonGroup className="jtpp-editor-source">
				<Button
					variant={ activeSource === 'media' ? 'primary' : undefined }
					isPressed={ activeSource === 'media' }
					onClick={ () =>
						setAttributes( { source: 'media', trackId: 0 } )
					}
				>
					{ __( 'Media Library', 'jt-practice-player' ) }
				</Button>
				<Button
					variant={ activeSource === 'track' ? 'primary' : undefined }
					isPressed={ activeSource === 'track' }
					onClick={ () =>
						setAttributes( {
							source: 'track',
							id: 0,
							externalUrl: '',
							externalTitle: '',
							externalArtist: '',
							externalAlbum: '',
							externalArtwork: '',
							externalDuration: '',
						} )
					}
				>
					{ __( 'Shared Track', 'jt-practice-player' ) }
				</Button>
				<Button
					variant={
						activeSource === 'external' ? 'primary' : undefined
					}
					isPressed={ activeSource === 'external' }
					onClick={ () =>
						setAttributes( {
							source: 'external',
							id: 0,
							trackId: 0,
						} )
					}
				>
					{ __( 'External URL', 'jt-practice-player' ) }
				</Button>
			</ButtonGroup>

			{ trackEditor }
		</div>
	);
}
