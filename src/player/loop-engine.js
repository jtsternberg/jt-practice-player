export const SPEED_STEPS = [
	0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.25, 1.5, 1.75, 2,
];

export function loopJumpTarget( currentTime, loop ) {
	if ( ! loop || ! loop.on || loop.end <= loop.start ) {
		return null;
	}
	return currentTime >= loop.end ? loop.start : null;
}

export function clampSeek( time, duration ) {
	return Math.min( Math.max( time, 0 ), duration );
}

export function nextSpeed( current, direction ) {
	let nearest = 0;
	SPEED_STEPS.forEach( ( step, i ) => {
		if (
			Math.abs( step - current ) <
			Math.abs( SPEED_STEPS[ nearest ] - current )
		) {
			nearest = i;
		}
	} );
	const next = nearest + direction;
	return SPEED_STEPS[
		Math.min( Math.max( next, 0 ), SPEED_STEPS.length - 1 )
	];
}

export function nextPlaylistIndex(
	trackIds,
	checkedIds,
	activeIndex,
	direction,
	random = false,
	randomFn = Math.random
) {
	const checked = trackIds
		.map( ( id, index ) => ( checkedIds.includes( id ) ? index : null ) )
		.filter( ( index ) => index !== null );
	const playable = checked.length
		? checked
		: trackIds.map( ( _id, index ) => index );
	if ( playable.length === 0 ) {
		return null;
	}
	if ( random && direction > 0 ) {
		const candidates =
			playable.length > 1
				? playable.filter( ( index ) => index !== activeIndex )
				: playable;
		return candidates[ Math.floor( randomFn() * candidates.length ) ];
	}
	const currentPosition = playable.indexOf( activeIndex );
	if ( currentPosition !== -1 ) {
		return playable[
			( currentPosition + direction + playable.length ) % playable.length
		];
	}
	if ( direction > 0 ) {
		return (
			playable.find( ( index ) => index > activeIndex ) ?? playable[ 0 ]
		);
	}
	return (
		[ ...playable ].reverse().find( ( index ) => index < activeIndex ) ??
		playable[ playable.length - 1 ]
	);
}

export function formatTime( seconds ) {
	if ( ! Number.isFinite( seconds ) || seconds < 0 ) {
		return '0:00';
	}
	const m = Math.floor( seconds / 60 );
	const s = Math.floor( seconds % 60 );
	return `${ m }:${ String( s ).padStart( 2, '0' ) }`;
}
