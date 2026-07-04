import { formatTime } from '../loop-engine';

describe( 'formatTime', () => {
	it( 'formats zero', () => expect( formatTime( 0 ) ).toBe( '0:00' ) );
	it( 'pads seconds', () => expect( formatTime( 62.4 ) ).toBe( '1:02' ) );
	it( 'handles hour-long files', () =>
		expect( formatTime( 3723 ) ).toBe( '62:03' ) );
	it( 'guards NaN', () => expect( formatTime( NaN ) ).toBe( '0:00' ) );
} );
