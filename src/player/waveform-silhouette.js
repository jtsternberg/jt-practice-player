/**
 * Pure peak-downsampling helpers for the decorative timeline silhouette.
 *
 * The compact timeline paints a low-res peak silhouette behind the progress
 * fill, built ONLY from peak data already cached by a loop-edit session. These
 * helpers carry no DOM or fetch dependencies: they just reduce a full-res peak
 * channel set into a handful of normalized bar heights so the silhouette can be
 * drawn (and unit-tested) in isolation. Nothing here ever fetches or decodes.
 */

/**
 * Collapse cached peak channels into `barCount` normalized bar heights.
 *
 * Accepts the cached peak `data` shape used by the player: an array of channel
 * arrays, each channel an array of signed sample peaks in roughly [-1, 1]. Each
 * output bar is the maximum absolute amplitude across all channels within its
 * window, then the whole set is normalized so the loudest bar is 1. This keeps
 * the silhouette using the full available height regardless of track loudness.
 *
 * @param {Array<Array<number>>} channels Array of channel peak arrays.
 * @param {number}               barCount Desired number of output bars.
 * @return {number[]} Bar heights in [0, 1]; empty when there is nothing to draw.
 */
export function downsamplePeaks( channels, barCount ) {
	if (
		! Array.isArray( channels ) ||
		channels.length === 0 ||
		! Array.isArray( channels[ 0 ] ) ||
		channels[ 0 ].length === 0 ||
		! Number.isFinite( barCount ) ||
		barCount <= 0
	) {
		return [];
	}

	const bars = Math.floor( barCount );
	const sampleCount = channels[ 0 ].length;
	const step = sampleCount / bars;
	const heights = new Array( bars );
	let max = 0;

	for ( let bar = 0; bar < bars; bar++ ) {
		const start = Math.floor( bar * step );
		const end = Math.min( sampleCount, Math.ceil( ( bar + 1 ) * step ) );
		let peak = 0;
		for ( let channel = 0; channel < channels.length; channel++ ) {
			const data = channels[ channel ];
			if ( ! Array.isArray( data ) ) {
				continue;
			}
			for ( let i = start; i < end; i++ ) {
				const amp = Math.abs( data[ i ] || 0 );
				if ( amp > peak ) {
					peak = amp;
				}
			}
		}
		heights[ bar ] = peak;
		if ( peak > max ) {
			max = peak;
		}
	}

	if ( max <= 0 ) {
		return heights.fill( 0 );
	}
	return heights.map( ( peak ) => peak / max );
}

/**
 * Turn normalized bar heights into normalized rectangles the renderer can map
 * into any viewbox. Each slot gets a centered bar with a symmetric gap, keeping
 * the SVG geometry (and its tests) free of any pixel or viewbox assumptions.
 *
 * @param {number[]} heights  Normalized bar heights in [0, 1].
 * @param {number}   gapRatio Fraction of each slot used as the gap (0–0.9).
 * @return {Array<{x: number, width: number, height: number}>} Bar rects with
 *                                                              x/width/height
 *                                                              as [0, 1]
 *                                                              fractions.
 */
export function peakBarRects( heights, gapRatio = 0.32 ) {
	if ( ! Array.isArray( heights ) || heights.length === 0 ) {
		return [];
	}
	const gap = Math.min( 0.9, Math.max( 0, gapRatio ) );
	const slot = 1 / heights.length;
	const width = slot * ( 1 - gap );
	const offset = ( slot - width ) / 2;
	return heights.map( ( height, index ) => ( {
		x: index * slot + offset,
		width,
		// Floor a hair of height so silent bars still read as a seam, not a gap.
		height: Math.max( 0.06, Math.min( 1, height ) ),
	} ) );
}
