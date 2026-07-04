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

function prune( storage, now ) {
	const stale = [];
	for ( let i = 0; i < storage.length; i++ ) {
		const key = storage.key( i );
		if ( ! key || ! key.startsWith( PREFIX ) ) {
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
