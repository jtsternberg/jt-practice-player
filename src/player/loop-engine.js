export const SPEED_STEPS = [ 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1 ];

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
