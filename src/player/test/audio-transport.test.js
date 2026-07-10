import { createAudioTransport } from '../audio-transport';

function fakeAudio( {
	duration = 100,
	currentTime = 20,
	paused = false,
} = {} ) {
	const audio = document.createElement( 'audio' );
	Object.defineProperties( audio, {
		duration: { value: duration, configurable: true },
		currentTime: { value: currentTime, writable: true, configurable: true },
		paused: { value: paused, configurable: true },
	} );
	return audio;
}

describe( 'createAudioTransport', () => {
	it( 'clamps seeks and reports a stable snapshot', () => {
		const audio = fakeAudio();
		const transport = createAudioTransport( audio );
		transport.seekBy( 200 );
		expect( audio.currentTime ).toBe( 100 );
		expect( transport.snapshot() ).toMatchObject( {
			position: 100,
			duration: 100,
			playing: true,
		} );
	} );

	it( 'seekBy clamps below zero to zero', () => {
		const audio = fakeAudio( { currentTime: 5 } );
		const transport = createAudioTransport( audio );
		transport.seekBy( -50 );
		expect( audio.currentTime ).toBe( 0 );
	} );

	it( 'seekTo ignores non-finite values and clamps finite ones', () => {
		const audio = fakeAudio( { currentTime: 10 } );
		const transport = createAudioTransport( audio );
		transport.seekTo( Number.NaN );
		expect( audio.currentTime ).toBe( 10 );
		transport.seekTo( 250 );
		expect( audio.currentTime ).toBe( 100 );
		transport.seekTo( 42 );
		expect( audio.currentTime ).toBe( 42 );
	} );

	it( 'play/pause/stop delegate to the audio element', () => {
		const audio = fakeAudio( { currentTime: 30 } );
		audio.play = jest.fn( () => Promise.resolve() );
		audio.pause = jest.fn();
		const transport = createAudioTransport( audio );
		transport.play();
		transport.pause();
		transport.stop();
		expect( audio.play ).toHaveBeenCalledTimes( 1 );
		expect( audio.pause ).toHaveBeenCalledTimes( 2 );
		expect( audio.currentTime ).toBe( 0 );
	} );

	it( 'setRate and setVolume forward to the audio element', () => {
		const audio = fakeAudio();
		const transport = createAudioTransport( audio );
		transport.setRate( 0.75 );
		transport.setVolume( 0.4 );
		expect( audio.playbackRate ).toBe( 0.75 );
		expect( audio.volume ).toBe( 0.4 );
	} );

	it( 'reports paused state in snapshot', () => {
		const audio = fakeAudio( { paused: true, currentTime: 12 } );
		const transport = createAudioTransport( audio );
		expect( transport.snapshot() ).toMatchObject( {
			playing: false,
			position: 12,
		} );
	} );

	it( 'on() adds a listener and returns an unbinder', () => {
		const audio = fakeAudio();
		const add = jest.spyOn( audio, 'addEventListener' );
		const remove = jest.spyOn( audio, 'removeEventListener' );
		const transport = createAudioTransport( audio );
		const handler = jest.fn();
		const off = transport.on( 'timeupdate', handler );
		expect( add ).toHaveBeenCalledWith( 'timeupdate', handler, undefined );
		off();
		expect( remove ).toHaveBeenCalledWith(
			'timeupdate',
			handler,
			undefined
		);
	} );

	it( 'destroy pauses and releases the source', () => {
		const audio = fakeAudio();
		audio.pause = jest.fn();
		audio.load = jest.fn();
		audio.setAttribute( 'src', 'https://media.example.test/heavy.mp3' );
		const transport = createAudioTransport( audio );
		transport.destroy();
		expect( audio.pause ).toHaveBeenCalled();
		expect( audio.hasAttribute( 'src' ) ).toBe( false );
		expect( audio.load ).toHaveBeenCalled();
	} );
} );
