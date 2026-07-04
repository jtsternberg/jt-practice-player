import { __ } from '@wordpress/i18n';
import { useSelect } from '@wordpress/data';
import {
	useBlockProps,
	MediaPlaceholder,
	InspectorControls,
} from '@wordpress/block-editor';
import {
	PanelBody,
	ToggleControl,
	TextControl,
	Button,
} from '@wordpress/components';

export default function Edit( { attributes, setAttributes } ) {
	const { id, customTitle, showSkipButtons, showSpeedControl } = attributes;
	const attachment = useSelect(
		( select ) => ( id ? select( 'core' ).getMedia( id ) : null ),
		[ id ]
	);

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
				</PanelBody>
			</InspectorControls>
			{ ! id ? (
				<MediaPlaceholder
					allowedTypes={ [ 'audio' ] }
					labels={ {
						title: __( 'Practice Track', 'jt-practice-player' ),
					} }
					onSelect={ ( media ) => setAttributes( { id: media.id } ) }
				/>
			) : (
				<div className="jtpp-editor-track">
					<TextControl
						label={ __( 'Track title', 'jt-practice-player' ) }
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
						{ __( 'Replace audio file', 'jt-practice-player' ) }
					</Button>
				</div>
			) }
		</div>
	);
}
