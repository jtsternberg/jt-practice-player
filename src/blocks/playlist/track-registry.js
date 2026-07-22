const CANONICAL_KEYS = [
	'url',
	'title',
	'artist',
	'album',
	'duration',
	'artwork',
	'lyrics',
];

function stripMarkup( value ) {
	if ( ! value ) {
		return '';
	}
	return String( value )
		.replace( /<[^>]*>/g, '' )
		.trim();
}

function termsForTaxonomy( track, taxonomy ) {
	const groups = track?._embedded?.[ 'wp:term' ] || [];
	return groups
		.flat()
		.filter( ( term ) => term.taxonomy === taxonomy )
		.map( ( term ) => term.name )
		.filter( Boolean )
		.join( ', ' );
}

export function canonicalFieldsFromTrack( track ) {
	const meta = track?.meta || {};
	return {
		trackId: track?.trackId || track?.id || 0,
		url: track?.url || meta._jtpp_track_url || '',
		title: stripMarkup( track?.title?.rendered || track?.title || '' ),
		artist: track?.artist || termsForTaxonomy( track, 'jtpp_track_artist' ),
		album: track?.album || termsForTaxonomy( track, 'jtpp_track_album' ),
		duration: track?.duration || meta._jtpp_track_duration || '',
		artwork: track?.artwork || meta._jtpp_track_artwork || '',
		lyrics: track?.lyrics || meta._jtpp_track_lyrics || '',
	};
}

export function hasCanonicalChanges( original, current ) {
	if ( ! original || ! current?.trackId ) {
		return false;
	}
	return CANONICAL_KEYS.some(
		( key ) => ( original[ key ] || '' ) !== ( current[ key ] || '' )
	);
}

export function shouldEnableTrackSave( original, current ) {
	if ( current?.trackId ) {
		return hasCanonicalChanges( original, current );
	}
	return Boolean( current?.url );
}

export function shouldSyncDraftWithBlockTrack( track ) {
	return ! track?.trackId;
}
