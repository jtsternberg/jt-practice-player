// Keyboard guards for the practice player, kept pure so they are unit-testable
// without booting a full player (which pulls in WaveSurfer and the DOM).

// A focused button should activate on Space/Enter itself; don't hijack those.
export function buttonTargetHandlesKey( target, key ) {
	return !! (
		target?.closest?.( 'button' ) &&
		( key === ' ' || key === 'Enter' )
	);
}

// Typing a space (etc.) into a text-entry context must reach that field.
export function targetAcceptsText( target ) {
	return !! target?.closest?.(
		'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
	);
}

// Space toggles playback page-wide (like YouTube/Spotify) no matter where
// focus is, EXCEPT when a focused button should consume it or the user is
// typing into a text field. Only space qualifies; every other shortcut stays
// focus-scoped to the player.
export function shouldHandleGlobalSpace( target, key ) {
	return (
		key === ' ' &&
		! buttonTargetHandlesKey( target, key ) &&
		! targetAcceptsText( target )
	);
}
