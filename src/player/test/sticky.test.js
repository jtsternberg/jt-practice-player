import { shouldStickPlayer } from '../sticky';

describe( 'shouldStickPlayer', () => {
	const viewportHeight = 800;
	const panelHeight = 260;
	const bottomGap = 10;

	it( 'holds the fixed player until the in-flow panel bottom reaches the viewport', () => {
		expect(
			shouldStickPlayer( {
				trackCount: 5,
				shellTop: 100,
				panelTop: 531,
				panelHeight,
				viewportHeight,
				bottomGap,
			} )
		).toBe( true );

		expect(
			shouldStickPlayer( {
				trackCount: 5,
				shellTop: 100,
				panelTop: 530,
				panelHeight,
				viewportHeight,
				bottomGap,
			} )
		).toBe( false );
	} );
} );
