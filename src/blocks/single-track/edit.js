import { __ } from '@wordpress/i18n';
import { useSelect } from '@wordpress/data';
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

export default function Edit( { attributes, setAttributes } ) {
	const {
		id,
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
	const activeSource =
		source || ( id ? 'media' : externalUrl ? 'external' : 'media' );

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
					onClick={ () => setAttributes( { source: 'media' } ) }
				>
					{ __( 'Media Library', 'jt-practice-player' ) }
				</Button>
				<Button
					variant={
						activeSource === 'external' ? 'primary' : undefined
					}
					isPressed={ activeSource === 'external' }
					onClick={ () => setAttributes( { source: 'external' } ) }
				>
					{ __( 'External URL', 'jt-practice-player' ) }
				</Button>
			</ButtonGroup>

			{ activeSource === 'media' ? (
				! id ? (
					<MediaPlaceholder
						allowedTypes={ [ 'audio' ] }
						labels={ {
							title: __(
								'Practice Track',
								'jt-practice-player'
							),
						} }
						onSelect={ ( media ) =>
							setAttributes( { id: media.id } )
						}
					/>
				) : (
					<div className="jtpp-editor-track">
						<div className="jtpp-editor-track__fields">
							<DebouncedText
								label={ __(
									'Track title',
									'jt-practice-player'
								) }
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
									setAttributes( { id: 0, customTitle: '' } )
								}
							>
								{ __(
									'Replace audio file',
									'jt-practice-player'
								) }
							</Button>
						</div>
					</div>
				)
			) : (
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
							placeholder={ __(
								'Song title',
								'jt-practice-player'
							) }
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
								label={ __(
									'Duration',
									'jt-practice-player'
								) }
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
			) }
		</div>
	);
}
