const PREFIX = 'jtpp:';
const MAX_AGE_MS = 90 * 86400000;

function defaultStorage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function loadTrackState( trackId, storage = defaultStorage() ) {
	try {
		const raw = storage && storage.getItem( PREFIX + trackId );
		if ( ! raw ) {
			return null;
		}
		const parsed = JSON.parse( raw );
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
}

export function saveTrackState(
	trackId,
	state,
	storage = defaultStorage(),
	now = Date.now()
) {
	try {
		storage.setItem(
			PREFIX + trackId,
			JSON.stringify( { ...state, updatedAt: now } )
		);
		prune( storage, now );
	} catch {
		// Persistence is best-effort.
	}
}

export function loadSavedLoops( trackId, storage = defaultStorage() ) {
	try {
		const raw =
			storage && storage.getItem( `${ PREFIX }loops:${ trackId }` );
		const parsed = raw ? JSON.parse( raw ) : null;
		if ( ! Array.isArray( parsed ) ) {
			return [];
		}
		return parsed
			.map( normalizeSavedLoop )
			.filter( Boolean )
			.sort( ( a, b ) => ( b.updatedAt || 0 ) - ( a.updatedAt || 0 ) );
	} catch {
		return [];
	}
}

export function saveSavedLoops( trackId, loops, storage = defaultStorage() ) {
	try {
		storage.setItem(
			`${ PREFIX }loops:${ trackId }`,
			JSON.stringify( loops.map( normalizeSavedLoop ).filter( Boolean ) )
		);
	} catch {
		// Persistence is best-effort.
	}
}

export function loadQueue( trackIds, storage = defaultStorage() ) {
	try {
		const raw =
			storage &&
			storage.getItem( `${ PREFIX }queue:${ trackIds.join( '-' ) }` );
		const parsed = raw ? JSON.parse( raw ) : null;
		return Array.isArray( parsed ) ? parsed : [ ...trackIds ];
	} catch {
		return [ ...trackIds ];
	}
}

export function saveQueue( trackIds, checkedIds, storage = defaultStorage() ) {
	try {
		storage.setItem(
			`${ PREFIX }queue:${ trackIds.join( '-' ) }`,
			JSON.stringify( checkedIds )
		);
	} catch {
		// Best-effort.
	}
}

export function loadOrder( trackIds, storage = defaultStorage() ) {
	try {
		const raw =
			storage &&
			storage.getItem( `${ PREFIX }order:${ trackIds.join( '-' ) }` );
		const parsed = raw ? JSON.parse( raw ) : null;
		if ( ! Array.isArray( parsed ) ) {
			return [ ...trackIds ];
		}
		const known = new Set( trackIds );
		const ordered = parsed.filter( ( id ) => known.has( id ) );
		const missing = trackIds.filter( ( id ) => ! ordered.includes( id ) );
		return [ ...ordered, ...missing ];
	} catch {
		return [ ...trackIds ];
	}
}

export function saveOrder( trackIds, orderedIds, storage = defaultStorage() ) {
	try {
		storage.setItem(
			`${ PREFIX }order:${ trackIds.join( '-' ) }`,
			JSON.stringify( orderedIds )
		);
	} catch {
		// Best-effort.
	}
}

export function loadVolume( storage = defaultStorage() ) {
	try {
		const raw = storage && storage.getItem( `${ PREFIX }volume` );
		const parsed = raw === null || raw === undefined ? NaN : Number( raw );
		return Number.isFinite( parsed )
			? Math.min( Math.max( parsed, 0 ), 1 )
			: 1;
	} catch {
		return 1;
	}
}

export function saveVolume( volume, storage = defaultStorage() ) {
	try {
		storage.setItem( `${ PREFIX }volume`, String( volume ) );
	} catch {
		// Best-effort.
	}
}

function normalizeSavedLoop( loop ) {
	if ( ! loop || typeof loop !== 'object' ) {
		return null;
	}
	const start = Number( loop.start );
	const end = Number( loop.end );
	if (
		! Number.isFinite( start ) ||
		! Number.isFinite( end ) ||
		end <= start
	) {
		return null;
	}
	const name = String( loop.name || '' ).trim();
	return {
		id: String( loop.id || `${ start }-${ end }` ),
		name:
			name ||
			`${ formatStorageTime( start ) }-${ formatStorageTime( end ) }`,
		start,
		end,
		rate: Number.isFinite( Number( loop.rate ) ) ? Number( loop.rate ) : 1,
		updatedAt: Number.isFinite( Number( loop.updatedAt ) )
			? Number( loop.updatedAt )
			: Date.now(),
	};
}

function formatStorageTime( seconds ) {
	const safe = Math.max( 0, Number( seconds ) || 0 );
	const m = Math.floor( safe / 60 );
	const s = Math.floor( safe % 60 );
	return `${ m }:${ String( s ).padStart( 2, '0' ) }`;
}

function prune( storage, now ) {
	const stale = [];
	for ( let i = 0; i < storage.length; i++ ) {
		const key = storage.key( i );
		if ( ! key || ! /^jtpp:(?:\d+|url:[a-f0-9]{16})$/.test( key ) ) {
			continue;
		}
		try {
			const { updatedAt = 0 } =
				JSON.parse( storage.getItem( key ) ) || {};
			if ( now - updatedAt > MAX_AGE_MS ) {
				stale.push( key );
			}
		} catch {
			stale.push( key );
		}
	}
	stale.forEach( ( key ) => storage.removeItem( key ) );
}
