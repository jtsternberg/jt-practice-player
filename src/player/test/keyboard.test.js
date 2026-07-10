import {
	buttonTargetHandlesKey,
	targetAcceptsText,
	shouldHandleGlobalSpace,
} from '../keyboard';

function el( html ) {
	const wrap = document.createElement( 'div' );
	wrap.innerHTML = html;
	return wrap.firstElementChild;
}

describe( 'shouldHandleGlobalSpace', () => {
	it( 'claims space from a plain, non-interactive target (page body)', () => {
		const body = el( '<div>content</div>' );
		expect( shouldHandleGlobalSpace( body, ' ' ) ).toBe( true );
	} );

	it( 'ignores keys other than space', () => {
		const body = el( '<div>content</div>' );
		expect( shouldHandleGlobalSpace( body, 'ArrowRight' ) ).toBe( false );
		expect( shouldHandleGlobalSpace( body, 'Enter' ) ).toBe( false );
	} );

	it( 'yields to a focused button so space activates it', () => {
		const button = el( '<button>Play</button>' );
		expect( shouldHandleGlobalSpace( button, ' ' ) ).toBe( false );
	} );

	it( 'yields when the target is inside a button', () => {
		const button = el( '<button><span>Play</span></button>' );
		expect(
			shouldHandleGlobalSpace( button.querySelector( 'span' ), ' ' )
		).toBe( false );
	} );

	it( 'yields when typing space into text fields', () => {
		expect(
			shouldHandleGlobalSpace( el( '<input type="text" />' ), ' ' )
		).toBe( false );
		expect(
			shouldHandleGlobalSpace( el( '<textarea></textarea>' ), ' ' )
		).toBe( false );
		expect(
			shouldHandleGlobalSpace( el( '<select></select>' ), ' ' )
		).toBe( false );
		expect(
			shouldHandleGlobalSpace(
				el( '<div contenteditable="true">note</div>' ),
				' '
			)
		).toBe( false );
	} );

	it( 'tolerates a missing target and still claims space', () => {
		// No target is neither a button nor a text field, so space is global.
		expect( shouldHandleGlobalSpace( null, ' ' ) ).toBe( true );
		expect( shouldHandleGlobalSpace( undefined, ' ' ) ).toBe( true );
		expect( shouldHandleGlobalSpace( null, 'ArrowRight' ) ).toBe( false );
	} );
} );

describe( 'guard helpers', () => {
	it( 'buttonTargetHandlesKey only for space/Enter on a button', () => {
		const button = el( '<button>Go</button>' );
		expect( buttonTargetHandlesKey( button, ' ' ) ).toBe( true );
		expect( buttonTargetHandlesKey( button, 'Enter' ) ).toBe( true );
		expect( buttonTargetHandlesKey( button, 'ArrowLeft' ) ).toBe( false );
		expect( buttonTargetHandlesKey( el( '<div></div>' ), ' ' ) ).toBe(
			false
		);
	} );

	it( 'targetAcceptsText detects text-entry contexts', () => {
		expect( targetAcceptsText( el( '<input />' ) ) ).toBe( true );
		expect(
			targetAcceptsText( el( '<div contenteditable="">x</div>' ) )
		).toBe( true );
		expect( targetAcceptsText( el( '<div>x</div>' ) ) ).toBe( false );
	} );
} );
