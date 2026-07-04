import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';
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
import { dragHandle, chevronUp, chevronDown, trash } from '@wordpress/icons';

function TrackRow( {
	track,
	index,
	count,
	update,
	move,
	remove,
	draggingIndex,
	setDraggingIndex,
} ) {
	const attachment = useSelect(
		( select ) => select( 'core' ).getMedia( track.id ),
		[ track.id ]
	);
	const isDropTarget =
		draggingIndex !== null && draggingIndex !== index && draggingIndex >= 0;
	return (
		<Flex
			className={ `jtpp-editor-track${
				draggingIndex === index ? ' is-dragging' : ''
			}${ isDropTarget ? ' is-drop-target' : '' }` }
			align="flex-end"
			onDragOver={ ( event ) => {
				if ( draggingIndex === null || draggingIndex === index ) {
					return;
				}
				event.preventDefault();
				event.dataTransfer.dropEffect = 'move';
			} }
			onDrop={ ( event ) => {
				event.preventDefault();
				const from = Number(
					event.dataTransfer.getData( 'text/plain' )
				);
				move( Number.isFinite( from ) ? from : draggingIndex, index );
				setDraggingIndex( null );
			} }
		>
			<Button
				className="jtpp-editor-drag-handle"
				icon={ dragHandle }
				label={ __( 'Drag to reorder track', 'jt-practice-player' ) }
				draggable
				onDragStart={ ( event ) => {
					setDraggingIndex( index );
					event.dataTransfer.effectAllowed = 'move';
					event.dataTransfer.setData( 'text/plain', String( index ) );
				} }
				onDragEnd={ () => setDraggingIndex( null ) }
			/>
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
				icon={ chevronUp }
				label={ __( 'Move up', 'jt-practice-player' ) }
				disabled={ index === 0 }
				onClick={ () => move( index, index - 1 ) }
			/>
			<Button
				icon={ chevronDown }
				label={ __( 'Move down', 'jt-practice-player' ) }
				disabled={ index === count - 1 }
				onClick={ () => move( index, index + 1 ) }
			/>
			<Button
				icon={ trash }
				label={ __( 'Remove', 'jt-practice-player' ) }
				isDestructive
				onClick={ () => remove( index ) }
			/>
		</Flex>
	);
}

export default function Edit( { attributes, setAttributes } ) {
	const { tracks, showSkipButtons, showSpeedControl } = attributes;
	const [ draggingIndex, setDraggingIndex ] = useState( null );

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
		if (
			from === to ||
			from < 0 ||
			to < 0 ||
			from >= tracks.length ||
			to >= tracks.length
		) {
			return;
		}
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
							draggingIndex={ draggingIndex }
							setDraggingIndex={ setDraggingIndex }
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
