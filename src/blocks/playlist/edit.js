import { __ } from '@wordpress/i18n';
import { useState, useRef, useEffect } from '@wordpress/element';
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
	drag,
	startDrag,
} ) {
	const attachment = useSelect(
		( select ) => select( 'core' ).getMedia( track.id ),
		[ track.id ]
	);
	const title = track.customTitle || attachment?.title?.rendered || '';
	const isSource = drag && drag.from === index;
	// The insertion line lives in the gap above (index) or below (index + 1)
	// this row, suppressed for the two gaps flanking the row being dragged.
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
		<Flex
			className={ `jtpp-editor-track${ isSource ? ' is-dragging' : '' }${
				showAbove ? ' is-drop-above' : ''
			}${ showBelow ? ' is-drop-below' : '' }` }
			align="flex-end"
		>
			<Button
				className="jtpp-editor-drag-handle"
				icon={ dragHandle }
				label={ __( 'Drag to reorder track', 'jt-practice-player' ) }
				onPointerDown={ ( event ) => startDrag( event, index, title ) }
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
			<div className="jtpp-editor-mover">
				<Button
					className="jtpp-editor-mover__button"
					icon={ chevronUp }
					label={ __( 'Move up', 'jt-practice-player' ) }
					disabled={ index === 0 }
					onClick={ () => move( index, index - 1 ) }
				/>
				<Button
					className="jtpp-editor-mover__button"
					icon={ chevronDown }
					label={ __( 'Move down', 'jt-practice-player' ) }
					disabled={ index === count - 1 }
					onClick={ () => move( index, index + 1 ) }
				/>
			</div>
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
	const containerRef = useRef( null );
	// Pointer-based reorder state. Native HTML5 drag/drop is unreliable inside
	// the block-editor iframe (competing Gutenberg handlers swallow dragover),
	// so we drive the drag ourselves with pointer capture.
	// { from, title, x, y, gap } — gap is the insertion index (0..count).
	const [ drag, setDrag ] = useState( null );

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

	// Which gap the pointer currently sits in, by comparing its Y against each
	// row's midpoint. Scoped to this block's rows only.
	const gapAt = ( clientY ) => {
		const rows = containerRef.current
			? [ ...containerRef.current.querySelectorAll( '.jtpp-editor-track' ) ]
			: [];
		for ( let i = 0; i < rows.length; i++ ) {
			const rect = rows[ i ].getBoundingClientRect();
			if ( clientY < rect.top + rect.height / 2 ) {
				return i;
			}
		}
		return rows.length;
	};

	const startDrag = ( event, index, title ) => {
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
	};

	// While a drag is live, track the pointer on the document (this block's
	// document — the editor iframe) so movement is followed even once the
	// cursor leaves the small handle. Commit or cancel on release.
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
					// Skip the two gaps that leave the item where it is.
					if ( gap !== from && gap !== from + 1 ) {
						move( from, from < gap ? gap - 1 : gap );
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
							drag={ drag }
							startDrag={ startDrag }
						/>
					) ) }
					{ drag && (
						<div
							className="jtpp-editor-ghost"
							style={ { top: drag.y, left: drag.x } }
							aria-hidden="true"
						>
							{ drag.title || __( 'Track', 'jt-practice-player' ) }
						</div>
					) }
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
