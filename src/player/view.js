import './player.scss';
import { PracticePlayer } from './player';

function mountAll() {
	document.querySelectorAll( '[data-jtpp]' ).forEach( ( el ) => {
		if ( ! el.jtppPlayer ) {
			new PracticePlayer( el );
		}
	} );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', mountAll );
} else {
	mountAll();
}
