import { useState, useRef, useEffect } from '@wordpress/element';
import { TextControl } from '@wordpress/components';

/**
 * A TextControl that updates its own displayed value instantly but debounces
 * the (expensive) onChange write to the block store. In large playlists a raw
 * controlled TextControl makes typing lag, because every keystroke runs
 * setAttributes -> block re-serialization -> store propagation. Here that write
 * only fires after the author pauses, or on blur/unmount, so typing stays
 * snappy regardless of list size.
 *
 * @param {Object}   props
 * @param {string}   props.value    Committed value from block attributes.
 * @param {Function} props.onChange Called (debounced) with the new value.
 * @param {number}   [props.delay]  Debounce delay in ms (default 300).
 */
export default function DebouncedText( {
	value,
	onChange,
	delay = 300,
	...props
} ) {
	const [ local, setLocal ] = useState( value );
	const localRef = useRef( value );
	const timer = useRef();
	const pending = useRef( false );
	const lastEmitted = useRef( value );
	const onChangeRef = useRef( onChange );
	onChangeRef.current = onChange;

	// Adopt external value changes (reorder, undo, programmatic) but ignore the
	// echo of our own debounced write and anything typed but not yet flushed.
	useEffect( () => {
		if ( value !== lastEmitted.current && ! pending.current ) {
			setLocal( value );
			localRef.current = value;
			lastEmitted.current = value;
		}
	}, [ value ] );

	const emit = ( v ) => {
		pending.current = false;
		lastEmitted.current = v;
		onChangeRef.current( v );
	};

	const handleChange = ( v ) => {
		setLocal( v );
		localRef.current = v;
		pending.current = true;
		clearTimeout( timer.current );
		timer.current = setTimeout( () => emit( v ), delay );
	};

	const flush = () => {
		if ( pending.current ) {
			clearTimeout( timer.current );
			emit( localRef.current );
		}
	};

	// Flush any pending value when the field unmounts (e.g. row removed or
	// block deselected) so nothing is lost.
	useEffect( () => () => flush(), [] ); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<TextControl
			{ ...props }
			value={ local }
			onChange={ handleChange }
			onBlur={ ( event ) => {
				flush();
				props.onBlur?.( event );
			} }
		/>
	);
}
