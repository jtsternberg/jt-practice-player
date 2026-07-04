import { __ } from '@wordpress/i18n';
import { useSelect } from '@wordpress/data';
import {
	useBlockProps,
	MediaPlaceholder,
	MediaUpload,
	MediaUploadCheck,
	InspectorControls,
} from '@wordpress/block-editor';
import {
	PanelBody,
	ToggleControl,
	TextControl,
	Button,
	Flex,
	FlexItem,
} from '@wordpress/components';

function TrackRow( { track, index, count, update, move, remove } ) {
	const attachment = useSelect(
		( select ) => select( 'core' ).getMedia( track.id ),
		[ track.id ]
	);
	return (
		<Flex className="jtpp-editor-track" align="flex-end">
			<FlexItem isBlock>
				<TextControl
					label={ __( 'Title', 'jt-practice-player' ) }
					value={ track.customTitle || '' }
					placeholder={ attachment?.title?.rendered || '...' }
					onChange={ ( v ) =>
						update( index, { ...track, customTitle: v } )
					}
				/>
			</FlexItem>
			<Button
				icon="arrow-up-alt2"
				label={ __( 'Move up', 'jt-practice-player' ) }
				disabled={ index === 0 }
				onClick={ () => move( index, index - 1 ) }
			/>
			<Button
				icon="arrow-down-alt2"
				label={ __( 'Move down', 'jt-practice-player' ) }
				disabled={ index === count - 1 }
				onClick={ () => move( index, index + 1 ) }
			/>
			<Button
				icon="trash"
				label={ __( 'Remove', 'jt-practice-player' ) }
				isDestructive
				onClick={ () => remove( index ) }
			/>
		</Flex>
	);
}

export default function Edit( { attributes, setAttributes } ) {
	const { tracks, showSkipButtons, showSpeedControl } = attributes;

	const addMedia = ( media ) => {
		const additions = ( Array.isArray( media ) ? media : [ media ] ).map(
			( m ) => ( {
				id: m.id,
				customTitle: '',
			} )
		);
		setAttributes( { tracks: [ ...tracks, ...additions ] } );
	};
	const update = ( i, track ) =>
		setAttributes( {
			tracks: tracks.map( ( t, n ) => ( n === i ? track : t ) ),
		} );
	const move = ( from, to ) => {
		const next = [ ...tracks ];
		next.splice( to, 0, next.splice( from, 1 )[ 0 ] );
		setAttributes( { tracks: next } );
	};
	const remove = ( i ) =>
		setAttributes( { tracks: tracks.filter( ( _, n ) => n !== i ) } );

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
			{ tracks.length === 0 ? (
				<MediaPlaceholder
					allowedTypes={ [ 'audio' ] }
					multiple
					labels={ {
						title: __( 'Practice Playlist', 'jt-practice-player' ),
					} }
					onSelect={ addMedia }
				/>
			) : (
				<>
					{ tracks.map( ( track, i ) => (
						<TrackRow
							key={ `${ track.id }-${ i }` }
							track={ track }
							index={ i }
							count={ tracks.length }
							update={ update }
							move={ move }
							remove={ remove }
						/>
					) ) }
					<MediaUploadCheck>
						<MediaUpload
							allowedTypes={ [ 'audio' ] }
							multiple
							onSelect={ addMedia }
							render={ ( { open } ) => (
								<Button variant="secondary" onClick={ open }>
									{ __( 'Add tracks', 'jt-practice-player' ) }
								</Button>
							) }
						/>
					</MediaUploadCheck>
				</>
			) }
		</div>
	);
}
