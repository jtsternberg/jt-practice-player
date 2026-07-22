<?php
/**
 * Plugin Name:       JT Practice Player
 * Description:       Audio playlist and single-track blocks with waveform display and A-B section looping, for band practice.
 * Version:           0.1.0
 * Requires at least: 6.1
 * Requires PHP:      7.4
 * Author:            Justin Sternberg
 * License:           GPL-2.0-or-later
 * Text Domain:       jt-practice-player
 */

namespace JTPP;

defined( 'ABSPATH' ) || exit;

const JTPP_VERSION = '0.1.0';
const USER_LOOP_CUES_META_KEY = 'jtpp_saved_loop_cues';
const USER_LOOP_CUES_LIMIT    = 20;
const TRACK_POST_TYPE         = 'jtpp_track';
const TRACK_ARTIST_TAXONOMY   = 'jtpp_track_artist';
const TRACK_ALBUM_TAXONOMY    = 'jtpp_track_album';
const TRACK_URL_META_KEY      = '_jtpp_track_url';
const TRACK_GUID_META_KEY     = '_jtpp_track_guid';
const TRACK_DURATION_META_KEY = '_jtpp_track_duration';
const TRACK_ARTWORK_META_KEY  = '_jtpp_track_artwork';
const TRACK_LYRICS_META_KEY   = '_jtpp_track_lyrics';

add_action( 'init', __NAMESPACE__ . '\\register' );
add_action( 'save_post_' . TRACK_POST_TYPE, __NAMESPACE__ . '\\save_track_guid', 10, 2 );
add_action( 'rest_api_init', __NAMESPACE__ . '\\register_rest_routes' );
if ( defined( 'WP_CLI' ) && WP_CLI ) {
	\WP_CLI::add_command( 'jtpp migrate-tracks', __NAMESPACE__ . '\\CLI_Migrate_Tracks_Command' );
	\WP_CLI::add_command( 'jtpp track', __NAMESPACE__ . '\\CLI_Track_Command' );
}
function register() {
	$dir = plugin_dir_path( __FILE__ );
	$url = plugin_dir_url( __FILE__ );

	register_track_registry();

	$view_asset = file_exists( $dir . 'build/view.asset.php' )
		? include $dir . 'build/view.asset.php'
		: array(
			'dependencies' => array(),
			'version'      => JTPP_VERSION,
		);

	wp_register_script( 'jtpp-view', $url . 'build/view.js', $view_asset['dependencies'], $view_asset['version'], true );
	if ( file_exists( $dir . 'build/view.css' ) ) {
		wp_register_style( 'jtpp-player', $url . 'build/view.css', array(), $view_asset['version'] );
	}

	foreach ( glob( $dir . 'build/blocks/*/block.json' ) as $block_json ) {
		if ( function_exists( 'opcache_invalidate' ) ) {
			opcache_invalidate( $block_json, true );
			opcache_invalidate( dirname( $block_json ) . '/index.asset.php', true );
		}
		register_block_type( $block_json );
	}
}

function register_track_registry(): void {
	register_post_type(
		TRACK_POST_TYPE,
		array(
			'labels'             => array(
				'name'          => __( 'Practice Tracks', 'jt-practice-player' ),
				'singular_name' => __( 'Practice Track', 'jt-practice-player' ),
			),
			'public'             => false,
			'publicly_queryable' => false,
			'show_ui'            => true,
			'show_in_menu'       => true,
			'show_in_rest'       => true,
			'supports'           => array( 'title' ),
		)
	);

	foreach ( array( TRACK_ARTIST_TAXONOMY => __( 'Artists', 'jt-practice-player' ), TRACK_ALBUM_TAXONOMY => __( 'Albums', 'jt-practice-player' ) ) as $taxonomy => $label ) {
		register_taxonomy(
			$taxonomy,
			TRACK_POST_TYPE,
			array(
				'label'        => $label,
				'public'       => false,
				'show_ui'      => true,
				'show_in_rest' => true,
			)
		);
	}

	foreach ( array( TRACK_URL_META_KEY, TRACK_GUID_META_KEY, TRACK_DURATION_META_KEY, TRACK_ARTWORK_META_KEY, TRACK_LYRICS_META_KEY ) as $meta_key ) {
		register_post_meta(
			TRACK_POST_TYPE,
			$meta_key,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => __NAMESPACE__ . '\\sanitize_track_meta',
				'auth_callback'     => static function (): bool {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}
}

function sanitize_track_meta( $value, string $meta_key ): string {
	if ( TRACK_URL_META_KEY === $meta_key || TRACK_ARTWORK_META_KEY === $meta_key ) {
		return sanitize_external_url( $value );
	}
	if ( TRACK_GUID_META_KEY === $meta_key ) {
		$value = (string) $value;
		return preg_match( '/^url:[a-f0-9]{16}$/', $value ) ? $value : '';
	}
	if ( TRACK_LYRICS_META_KEY === $meta_key ) {
		return sanitize_textarea_field( $value );
	}
	return sanitize_text_field( $value );
}

function save_track_guid( int $post_id, $post ): void {
	$existing_guid = get_post_meta( $post_id, TRACK_GUID_META_KEY, true );
	if ( $existing_guid ) {
		return;
	}

	$guid = track_guid_from_url( get_post_meta( $post_id, TRACK_URL_META_KEY, true ) );
	if ( $guid ) {
		update_post_meta( $post_id, TRACK_GUID_META_KEY, $guid );
	}
}

function resolve_tracks( array $refs ): array {
	$tracks = array();
	foreach ( $refs as $ref ) {
		$track_id = isset( $ref['trackId'] ) ? (int) $ref['trackId'] : 0;
		if ( $track_id ) {
			$track = resolve_registry_track( $track_id, $ref );
			if ( $track ) {
				$tracks[] = $track;
			}
			continue;
		}

		$id  = isset( $ref['id'] ) ? (int) $ref['id'] : 0;
		$url = $id ? wp_get_attachment_url( $id ) : false;
		if ( $url ) {
			$tracks[] = resolve_attachment_track( $id, $url, $ref );
			continue;
		}
		$track = resolve_external_track( $ref );
		if ( $track ) {
			$tracks[] = $track;
		}
	}

	// Stored titles/artists/albums can carry HTML entities (e.g. "&#8217;",
	// "&#8211;"). The playlist rows render them through esc_html() in an HTML
	// context, so the browser decodes them; but the now-playing/meta/lyrics
	// titles are set from this JSON payload via textContent, which would show
	// the raw entities. Decode once here so every consumer gets real
	// characters.
	foreach ( $tracks as &$track ) {
		foreach ( array( 'title', 'artist', 'album' ) as $field ) {
			if ( ! empty( $track[ $field ] ) ) {
				$track[ $field ] = html_entity_decode( $track[ $field ], ENT_QUOTES, 'UTF-8' );
			}
		}
	}
	unset( $track );

	return $tracks;
}

function resolve_registry_track( int $track_id, array $ref ): ?array {
	static $memo = array();

	$post = get_post( $track_id );
	if ( ! $post || TRACK_POST_TYPE !== $post->post_type ) {
		return null;
	}

	$memo_key = $track_id . ':' . ( $post->post_modified ?? '' );
	if ( isset( $memo[ $memo_key ] ) ) {
		$track = $memo[ $memo_key ];
	} else {
		$url  = sanitize_external_url( get_post_meta( $track_id, TRACK_URL_META_KEY, true ) );
		$guid = sanitize_track_meta( get_post_meta( $track_id, TRACK_GUID_META_KEY, true ), TRACK_GUID_META_KEY );
		if ( ! $url || ! $guid ) {
			return null;
		}

		$track = array(
			'id'       => $guid,
			'url'      => $url,
			'title'    => get_the_title( $track_id ),
			'artist'   => track_term_names( $track_id, TRACK_ARTIST_TAXONOMY ),
			'album'    => track_term_names( $track_id, TRACK_ALBUM_TAXONOMY ),
			'artwork'  => sanitize_external_url( get_post_meta( $track_id, TRACK_ARTWORK_META_KEY, true ) ),
			'duration' => sanitize_text_field( get_post_meta( $track_id, TRACK_DURATION_META_KEY, true ) ),
			'lyrics'   => sanitize_textarea_field( get_post_meta( $track_id, TRACK_LYRICS_META_KEY, true ) ),
		);

		$memo[ $memo_key ] = $track;
	}

	if ( ! empty( $ref['customTitle'] ) ) {
		$track['title'] = sanitize_text_field( $ref['customTitle'] );
	}

	// A per-reference lyrics value (used by external tracks, which have no
	// shared record) shadows the shared-track lyrics stored above.
	if ( ! empty( $ref['lyrics'] ) ) {
		$track['lyrics'] = sanitize_textarea_field( $ref['lyrics'] );
	}

	return $track;
}

function track_term_names( int $track_id, string $taxonomy ): string {
	$terms = get_the_terms( $track_id, $taxonomy );
	if ( ! $terms || is_wp_error( $terms ) ) {
		return '';
	}

	return implode(
		', ',
		array_map(
			static function ( $term ): string {
				return sanitize_text_field( $term->name ?? '' );
			},
			$terms
		)
	);
}

function resolve_attachment_track( int $id, string $url, array $ref ): array {
	$meta     = wp_get_attachment_metadata( $id );
	$thumb_id = get_post_thumbnail_id( $id );
	$artwork  = $thumb_id ? wp_get_attachment_image_src( $thumb_id, 'thumbnail' ) : false;

	return array(
		'id'       => $id,
		'url'      => set_url_scheme( $url ),
		'title'    => ! empty( $ref['customTitle'] ) ? sanitize_text_field( $ref['customTitle'] ) : get_the_title( $id ),
		'artist'   => sanitize_text_field( $meta['artist'] ?? '' ),
		'album'    => sanitize_text_field( $meta['album'] ?? '' ),
		'artwork'  => $artwork ? set_url_scheme( $artwork[0] ) : '',
		'duration' => sanitize_text_field( $meta['length_formatted'] ?? '' ),
		'lyrics'   => sanitize_textarea_field( $ref['lyrics'] ?? '' ),
	);
}

function resolve_external_track( array $ref ): ?array {
	$url = sanitize_external_url( $ref['url'] ?? '' );
	if ( ! $url ) {
		return null;
	}

	$title = sanitize_text_field( $ref['title'] ?? '' );

	return array(
		'id'       => track_guid_from_url( $url ),
		'url'      => $url,
		'title'    => $title ? $title : title_from_url( $url ),
		'artist'   => sanitize_text_field( $ref['artist'] ?? '' ),
		'album'    => sanitize_text_field( $ref['album'] ?? '' ),
		'artwork'  => sanitize_external_url( $ref['artwork'] ?? '' ),
		'duration' => sanitize_text_field( $ref['duration'] ?? '' ),
		'lyrics'   => sanitize_textarea_field( $ref['lyrics'] ?? '' ),
	);
}

function track_guid_from_url( $url ): string {
	$url = sanitize_external_url( $url );
	return $url ? 'url:' . substr( md5( $url ), 0, 16 ) : '';
}

function sanitize_external_url( $url ): string {
	$url = esc_url_raw( trim( (string) $url ), array( 'http', 'https' ) );
	return $url && wp_http_validate_url( $url ) ? set_url_scheme( $url ) : '';
}

function title_from_url( string $url ): string {
	$path  = (string) wp_parse_url( $url, PHP_URL_PATH );
	$title = $path ? basename( $path ) : __( 'External audio', 'jt-practice-player' );
	$title = preg_replace( '/\.[a-z0-9]{2,5}$/i', '', $title );
	$title = str_replace( array( '-', '_' ), ' ', rawurldecode( $title ) );
	$title = trim( $title );

	return $title ? $title : __( 'External audio', 'jt-practice-player' );
}

function player_style_from_attributes( array $attributes ): string {
	$colors = array(
		'accentColor'   => '--jtpp-accent',
		'loopColor'     => '--jtpp-loop',
		'playheadColor' => '--jtpp-playhead',
	);
	$styles = array();
	foreach ( $colors as $attribute => $property ) {
		$color = sanitize_hex_color( $attributes[ $attribute ] ?? '' );
		if ( $color ) {
			$styles[] = $property . ':' . $color;
		}
	}
	return implode( ';', $styles );
}

function render_player( array $tracks, array $options ): string {
	if ( ! $tracks ) {
		return '';
	}
	wp_enqueue_script( 'jtpp-view' );
	wp_enqueue_style( 'jtpp-player' );

	$payload = array( 'tracks' => $tracks, 'options' => $options );
	if ( is_user_logged_in() ) {
		$payload['userLoopCues'] = array(
			'restUrl' => esc_url_raw( rest_url( 'jtpp/v1/saved-loops' ) ),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
		);
	}

	$loop_name_id     = wp_unique_id( 'jtpp-loop-name-' );
	$lyrics_title_id  = wp_unique_id( 'jtpp-lyrics-title-' );

	ob_start();
	?>
	<script type="application/json" class="jtpp-data"><?php echo wp_json_encode( $payload ); ?></script>
	<?php if ( $options['playlist'] ) : ?>
	<div class="jtpp-shell">
	<?php endif; ?>
	<?php if ( $options['playlist'] ) : ?>
	<button type="button" class="jtpp-fs-queue" aria-expanded="false" aria-label="<?php esc_attr_e( 'Toggle queue', 'jt-practice-player' ); ?>"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg><span><?php esc_html_e( 'Queue', 'jt-practice-player' ); ?></span></button>
	<div class="jtpp-queue">
	<ol class="jtpp-tracklist">
		<?php foreach ( $tracks as $i => $track ) : ?>
		<li class="jtpp-track-row" data-index="<?php echo esc_attr( $i ); ?>">
			<button type="button" class="jtpp-drag-handle" draggable="true" data-index="<?php echo esc_attr( $i ); ?>" aria-label="<?php esc_attr_e( 'Reorder track', 'jt-practice-player' ); ?>"><?php echo icon( 'grip' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button>
			<input type="checkbox" class="jtpp-queue-check" data-index="<?php echo esc_attr( $i ); ?>" checked aria-label="<?php esc_attr_e( 'Include in practice rotation', 'jt-practice-player' ); ?>" />
			<button type="button" class="jtpp-track" data-index="<?php echo esc_attr( $i ); ?>">
				<span class="jtpp-track-copy">
					<span class="jtpp-track-title"><?php echo esc_html( $track['title'] ); ?></span>
					<?php if ( ! empty( $track['artist'] ) ) : ?><span class="jtpp-track-artist"><?php echo esc_html( $track['artist'] ); ?></span><?php endif; ?>
				</span>
				<span class="jtpp-track-duration"><?php echo esc_html( $track['duration'] ); ?></span>
			</button>
			<a class="jtpp-download" href="<?php echo esc_url( $track['url'] ); ?>" download aria-label="<?php esc_attr_e( 'Download track', 'jt-practice-player' ); ?>"><?php echo icon( 'download' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></a>
		</li>
		<?php endforeach; ?>
	</ol>
	</div>
	<?php endif; ?>
	<div class="jtpp-panel">
		<div class="jtpp-artwork-glow" aria-hidden="true"></div>
		<button type="button" class="jtpp-fs-close" aria-label="<?php esc_attr_e( 'Exit full screen', 'jt-practice-player' ); ?>"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
		<div class="jtpp-now-playing">
			<img class="jtpp-artwork" alt="" hidden />
			<div class="jtpp-now-copy">
				<div class="jtpp-now-title"></div>
				<div class="jtpp-now-meta"></div>
			</div>
			<div class="jtpp-loop-mode-bar">
				<p class="jtpp-loop-help" hidden><?php esc_html_e( 'Drag to select a section. Tap to position the playhead.', 'jt-practice-player' ); ?></p>
				<button type="button" class="jtpp-loop-edit"><?php esc_html_e( 'Set loop', 'jt-practice-player' ); ?></button>
				<button type="button" class="jtpp-loop-edit-done" hidden><?php esc_html_e( 'Done', 'jt-practice-player' ); ?></button>
			</div>
			<div class="jtpp-more-wrap">
				<button type="button" class="jtpp-more" aria-haspopup="menu" aria-expanded="false" aria-label="<?php esc_attr_e( 'More actions', 'jt-practice-player' ); ?>"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="19" cy="12" r="1.7"></circle></svg></button>
				<div class="jtpp-more-menu" role="menu" hidden>
					<button type="button" role="menuitem" class="jtpp-more-download"><?php esc_html_e( 'Download', 'jt-practice-player' ); ?></button>
					<button type="button" role="menuitem" class="jtpp-more-share"><?php esc_html_e( 'Share', 'jt-practice-player' ); ?></button>
					<button type="button" role="menuitem" class="jtpp-more-remove"><?php esc_html_e( 'Remove from queue', 'jt-practice-player' ); ?></button>
				</div>
			</div>
		</div>
		<div class="jtpp-timeline" role="slider" tabindex="0" aria-label="<?php esc_attr_e( 'Playback position', 'jt-practice-player' ); ?>" aria-valuemin="0" aria-valuenow="0">
			<div class="jtpp-timeline-gradient"></div>
			<div class="jtpp-timeline-progress"></div>
			<div class="jtpp-timeline-playhead"></div>
		</div>
		<div class="jtpp-waveform" hidden></div>
		<div class="jtpp-fallback" hidden></div>
		<div class="jtpp-times"><span class="jtpp-time-current">0:00</span><span class="jtpp-time-total">0:00</span></div>
		<div class="jtpp-loop-tools" hidden>
			<div class="jtpp-loop-current" hidden>
				<div class="jtpp-loop-summary">
					<span class="jtpp-loop-label"><?php esc_html_e( 'Loop', 'jt-practice-player' ); ?></span>
					<span class="jtpp-loop-range">0:00-0:00</span>
					<button type="button" class="jtpp-loop-clear" aria-label="<?php esc_attr_e( 'Clear current loop', 'jt-practice-player' ); ?>"><?php echo icon( 'close' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button>
				</div>
				<button type="button" class="jtpp-loop-save"><?php esc_html_e( 'Save cue', 'jt-practice-player' ); ?></button>
				<div class="jtpp-zoom-controls" aria-label="<?php esc_attr_e( 'Selection zoom controls', 'jt-practice-player' ); ?>">
					<button type="button" class="jtpp-zoom-out" aria-label="<?php esc_attr_e( 'Zoom out', 'jt-practice-player' ); ?>">&minus;</button>
					<button type="button" class="jtpp-zoom-reset" aria-label="<?php esc_attr_e( 'Reset selection zoom', 'jt-practice-player' ); ?>"><?php esc_html_e( 'Fit loop', 'jt-practice-player' ); ?></button>
					<button type="button" class="jtpp-zoom-in" aria-label="<?php esc_attr_e( 'Zoom in', 'jt-practice-player' ); ?>">+</button>
				</div>
			</div>
			<div class="jtpp-loop-save-editor" hidden>
				<label for="<?php echo esc_attr( $loop_name_id ); ?>"><?php esc_html_e( 'Cue name', 'jt-practice-player' ); ?></label>
				<input type="text" id="<?php echo esc_attr( $loop_name_id ); ?>" class="jtpp-loop-name" value="" placeholder="<?php esc_attr_e( 'Section name', 'jt-practice-player' ); ?>" aria-label="<?php esc_attr_e( 'Saved cue name', 'jt-practice-player' ); ?>" />
				<span class="jtpp-loop-save-range">0:00-0:00</span>
				<div class="jtpp-loop-save-actions">
					<button type="button" class="jtpp-loop-save-confirm"><?php esc_html_e( 'Save cue', 'jt-practice-player' ); ?></button>
					<button type="button" class="jtpp-loop-save-cancel"><?php esc_html_e( 'Cancel', 'jt-practice-player' ); ?></button>
				</div>
			</div>
			<div class="jtpp-loop-saved" hidden aria-label="<?php esc_attr_e( 'Saved loop cues', 'jt-practice-player' ); ?>">
				<div class="jtpp-loop-saved-header">
					<span><?php esc_html_e( 'Saved cues', 'jt-practice-player' ); ?></span>
					<span><?php esc_html_e( 'Range', 'jt-practice-player' ); ?></span>
					<span><?php esc_html_e( 'Action', 'jt-practice-player' ); ?></span>
				</div>
				<div class="jtpp-loop-cues"></div>
			</div>
		</div>
		<div class="jtpp-controls">
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-prev" aria-label="<?php esc_attr_e( 'Previous track', 'jt-practice-player' ); ?>"><?php echo icon( 'prev' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<button type="button" class="jtpp-start" aria-label="<?php esc_attr_e( 'Back to start of track', 'jt-practice-player' ); ?>"><?php echo icon( 'start' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-back15" aria-label="<?php esc_attr_e( 'Back 15 seconds', 'jt-practice-player' ); ?>"><?php echo icon( 'back15' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<button type="button" class="jtpp-play" aria-label="<?php esc_attr_e( 'Play', 'jt-practice-player' ); ?>"><?php echo icon( 'play' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-fwd15" aria-label="<?php esc_attr_e( 'Forward 15 seconds', 'jt-practice-player' ); ?>"><?php echo icon( 'fwd15' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-next" aria-label="<?php esc_attr_e( 'Next track', 'jt-practice-player' ); ?>"><?php echo icon( 'next' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-random" aria-label="<?php esc_attr_e( 'Random order', 'jt-practice-player' ); ?>" aria-pressed="false"><?php echo icon( 'shuffle' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-repeat" aria-label="<?php esc_attr_e( 'Repeat off', 'jt-practice-player' ); ?>" aria-pressed="false"><?php echo icon( 'repeat' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<?php if ( ! empty( $options['fullscreen'] ) ) : ?><button type="button" class="jtpp-fullscreen" aria-label="<?php esc_attr_e( 'Enter fullscreen', 'jt-practice-player' ); ?>" aria-pressed="false"><?php echo icon( 'fullscreen' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<button type="button" class="jtpp-lyrics" hidden aria-label="<?php esc_attr_e( 'Show lyrics', 'jt-practice-player' ); ?>" aria-pressed="false"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></button>
			<?php if ( $options['speed'] ) : ?>
			<select class="jtpp-speed" aria-label="<?php esc_attr_e( 'Playback speed', 'jt-practice-player' ); ?>">
				<?php foreach ( array( '0.5', '0.6', '0.7', '0.75', '0.8', '0.9', '1', '1.1', '1.2', '1.25', '1.5', '1.75', '2' ) as $rate ) : ?>
					<option value="<?php echo esc_attr( $rate ); ?>" <?php selected( '1', $rate ); ?>><?php echo esc_html( $rate ); ?>&times;</option>
				<?php endforeach; ?>
			</select>
			<?php endif; ?>
			<input type="range" class="jtpp-volume" min="0" max="1" step="0.05" value="1" aria-label="<?php esc_attr_e( 'Volume', 'jt-practice-player' ); ?>" />
		</div>
	</div>
	<?php if ( $options['playlist'] ) : ?>
	</div>
	<?php endif; ?>
	<?php
	// Rendered as a direct child of the block root (outside .jtpp-panel, whose
	// `isolation: isolate` would trap this overlay's z-index in a local
	// stacking context) so the fixed lyrics dialog reliably covers site chrome.
	?>
	<div class="jtpp-lyrics-panel" hidden role="dialog" aria-modal="false" tabindex="-1" aria-labelledby="<?php echo esc_attr( $lyrics_title_id ); ?>">
		<div class="jtpp-lyrics-header">
			<img class="jtpp-lyrics-art" alt="" hidden />
			<span class="jtpp-lyrics-heading">
				<span class="jtpp-lyrics-title" id="<?php echo esc_attr( $lyrics_title_id ); ?>" role="heading" aria-level="2" aria-live="polite" aria-atomic="true"></span>
				<span class="jtpp-lyrics-artist" aria-live="polite"></span>
			</span>
			<button type="button" class="jtpp-lyrics-close" aria-label="<?php esc_attr_e( 'Close lyrics', 'jt-practice-player' ); ?>"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
		</div>
		<div class="jtpp-lyrics-body"><div class="jtpp-lyrics-columns"></div></div>
		<?php // The live transport (seek bar, times, controls, volume) is relocated
		// into this footer by JS while the lyrics modal is open, then moved back
		// on close — so playback stays controllable while reading. ?>
		<div class="jtpp-lyrics-footer"></div>
	</div>
	<noscript>
		<?php foreach ( $tracks as $track ) : ?>
		<p><?php echo esc_html( $track['title'] ); ?></p>
		<audio controls preload="none" src="<?php echo esc_url( $track['url'] ); ?>"></audio>
		<?php endforeach; ?>
	</noscript>
	<?php
	return ob_get_clean();
}

function register_rest_routes() {
	register_rest_route(
		'jtpp/v1',
		'/tracks',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\rest_search_tracks',
				'permission_callback' => __NAMESPACE__ . '\\rest_current_user_can_edit_tracks',
			),
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\rest_save_track',
				'permission_callback' => __NAMESPACE__ . '\\rest_current_user_can_edit_tracks',
			),
		)
	);
	register_rest_route(
		'jtpp/v1',
		'/tracks/(?P<id>\d+)',
		array(
			'methods'             => \WP_REST_Server::READABLE,
			'callback'            => __NAMESPACE__ . '\\rest_get_track',
			'permission_callback' => __NAMESPACE__ . '\\rest_current_user_can_edit_tracks',
			'args'                => array(
				'id' => array(
					'type' => 'integer',
				),
			),
		)
	);

	register_rest_route(
		'jtpp/v1',
		'/saved-loops',
		array(
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => __NAMESPACE__ . '\\rest_get_saved_loops',
				'permission_callback' => __NAMESPACE__ . '\\rest_current_user_can_manage_saved_loops',
			),
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => __NAMESPACE__ . '\\rest_update_saved_loops',
				'permission_callback' => __NAMESPACE__ . '\\rest_current_user_can_manage_saved_loops',
			),
		)
	);
}

function rest_current_user_can_edit_tracks(): bool {
	return current_user_can( 'edit_posts' );
}

function rest_search_tracks( \WP_REST_Request $request ): \WP_REST_Response {
	$search = sanitize_text_field( $request->get_param( 'search' ) ?? '' );

	return rest_ensure_response(
		array(
			'tracks' => find_registry_tracks( $search, 10 ),
		)
	);
}

/**
 * Search the registry, returning prepared track arrays. An exact URL match (if
 * the search term is a URL) is surfaced first, then text-search results.
 * Shared by REST search and the CLI `track list` command.
 *
 * @param string $search Search term or audio URL. Empty lists recent tracks.
 * @param int    $limit  Max text-search results.
 * @return array<int,array>
 */
function find_registry_tracks( string $search = '', int $limit = 20 ): array {
	$posts   = array();
	$exclude = array();
	$url     = sanitize_external_url( $search );

	if ( $url ) {
		$track_id = find_registry_track_by_url( $url );
		if ( $track_id ) {
			$post = get_post( $track_id );
			if ( $post ) {
				$posts[]   = $post;
				$exclude[] = $track_id;
			}
		}
	}

	$search_posts = get_posts(
		array(
			'post_type'      => TRACK_POST_TYPE,
			'post_status'    => array( 'publish', 'draft' ),
			'posts_per_page' => $limit,
			's'              => $search,
			'post__not_in'   => $exclude,
			'orderby'        => 'title',
			'order'          => 'ASC',
		)
	);
	$posts        = array_merge( $posts, $search_posts );

	return array_map( __NAMESPACE__ . '\\rest_prepare_track', $posts );
}

/**
 * Best-effort count of published/draft posts whose content references the given
 * track via a `"trackId":<id>` block attribute. Used to warn before deletion.
 *
 * @param int $track_id Track post ID.
 * @return int
 */
function count_registry_track_references( int $track_id ): int {
	if ( $track_id < 1 ) {
		return 0;
	}

	$posts = get_posts(
		array(
			'post_type'      => 'any',
			'post_status'    => array( 'publish', 'draft', 'private', 'future' ),
			'posts_per_page' => -1,
			's'              => 'wp:jtpp/',
		)
	);

	$count   = 0;
	$pattern = '/"trackId"\s*:\s*' . $track_id . '\b/';
	foreach ( $posts as $post ) {
		if ( preg_match( $pattern, (string) $post->post_content ) ) {
			$count++;
		}
	}

	return $count;
}

function rest_get_track( \WP_REST_Request $request ) {
	$track = get_registry_track( (int) $request['id'] );
	if ( is_wp_error( $track ) ) {
		return $track;
	}

	return rest_ensure_response(
		array(
			'track' => $track,
		)
	);
}

/**
 * Fetch a single registry track's canonical fields, or WP_Error if the id is
 * not a jtpp_track. Shared by REST reads and the CLI `track get` command.
 *
 * @param int $id Track post ID.
 * @return array|\WP_Error
 */
function get_registry_track( int $id ) {
	$post = get_post( $id );
	if ( ! $post || TRACK_POST_TYPE !== $post->post_type ) {
		return new \WP_Error( 'jtpp_track_not_found', __( 'Track not found.', 'jt-practice-player' ), array( 'status' => 404 ) );
	}

	return rest_prepare_track( $post );
}

/**
 * Delete a registry track. Returns true on success or WP_Error if the id is not
 * a jtpp_track or the deletion fails.
 *
 * @param int  $id    Track post ID.
 * @param bool $force Skip trash and delete permanently.
 * @return true|\WP_Error
 */
function delete_registry_track( int $id, bool $force = false ) {
	$post = get_post( $id );
	if ( ! $post || TRACK_POST_TYPE !== $post->post_type ) {
		return new \WP_Error( 'jtpp_track_not_found', __( 'Track not found.', 'jt-practice-player' ), array( 'status' => 404 ) );
	}

	$deleted = wp_delete_post( $id, $force );
	if ( ! $deleted ) {
		return new \WP_Error( 'jtpp_track_delete_failed', __( 'Failed to delete track.', 'jt-practice-player' ), array( 'status' => 500 ) );
	}

	return true;
}

function rest_save_track( \WP_REST_Request $request ) {
	$saved_id = save_registry_track_from_fields( $request->get_json_params() );
	if ( is_wp_error( $saved_id ) ) {
		return $saved_id;
	}

	return rest_ensure_response(
		array(
			'track' => rest_prepare_track( get_post( $saved_id ) ),
		)
	);
}

function save_registry_track_from_fields( array $fields ) {
	$track_id = isset( $fields['trackId'] ) ? (int) $fields['trackId'] : 0;
	$title    = sanitize_text_field( $fields['title'] ?? '' );
	$url      = sanitize_external_url( $fields['url'] ?? '' );

	if ( ! $url ) {
		return new \WP_Error( 'jtpp_track_url_required', __( 'A valid audio URL is required.', 'jt-practice-player' ), array( 'status' => 400 ) );
	}

	$postarr = array(
		'post_type'   => TRACK_POST_TYPE,
		'post_status' => 'publish',
		'post_title'  => $title ? $title : title_from_url( $url ),
	);

	if ( $track_id ) {
		$postarr['ID'] = $track_id;
		$saved_id      = wp_update_post( $postarr, true );
	} else {
		$saved_id = wp_insert_post( $postarr, true );
	}

	if ( is_wp_error( $saved_id ) ) {
		return $saved_id;
	}

	update_post_meta( $saved_id, TRACK_URL_META_KEY, $url );
	update_post_meta( $saved_id, TRACK_DURATION_META_KEY, sanitize_text_field( $fields['duration'] ?? '' ) );
	update_post_meta( $saved_id, TRACK_ARTWORK_META_KEY, sanitize_external_url( $fields['artwork'] ?? '' ) );
	update_post_meta( $saved_id, TRACK_LYRICS_META_KEY, sanitize_textarea_field( $fields['lyrics'] ?? '' ) );

	save_track_guid( $saved_id, get_post( $saved_id ) );
	wp_set_object_terms( $saved_id, term_names_from_param( $fields['artist'] ?? '' ), TRACK_ARTIST_TAXONOMY );
	wp_set_object_terms( $saved_id, term_names_from_param( $fields['album'] ?? '' ), TRACK_ALBUM_TAXONOMY );

	return $saved_id;
}

/**
 * Apply a partial update to an existing registry track: fields present in
 * $fields overwrite current values, everything else is preserved. Routes
 * through save_registry_track_from_fields() so validation/guid rules match
 * REST, editor, and migration writes.
 *
 * @param int   $id     Track post ID.
 * @param array $fields Subset of title/url/artist/album/duration/artwork/lyrics.
 * @return int|\WP_Error Saved track ID or error.
 */
function apply_registry_track_updates( int $id, array $fields ) {
	$current = get_registry_track( $id );
	if ( is_wp_error( $current ) ) {
		return $current;
	}

	$merged = array(
		'trackId'  => $id,
		'title'    => $current['title'],
		'url'      => $current['url'],
		'artist'   => $current['artist'],
		'album'    => $current['album'],
		'duration' => $current['duration'],
		'artwork'  => $current['artwork'],
		'lyrics'   => $current['lyrics'],
	);

	foreach ( array( 'title', 'url', 'artist', 'album', 'duration', 'artwork', 'lyrics' ) as $key ) {
		if ( array_key_exists( $key, $fields ) && null !== $fields[ $key ] ) {
			$merged[ $key ] = $fields[ $key ];
		}
	}

	return save_registry_track_from_fields( $merged );
}

function rest_prepare_track( $post ): array {
	$track_id = (int) $post->ID;
	return array(
		'trackId'  => $track_id,
		'url'      => sanitize_external_url( get_post_meta( $track_id, TRACK_URL_META_KEY, true ) ),
		'title'    => get_the_title( $track_id ),
		'artist'   => track_term_names( $track_id, TRACK_ARTIST_TAXONOMY ),
		'album'    => track_term_names( $track_id, TRACK_ALBUM_TAXONOMY ),
		'duration' => sanitize_text_field( get_post_meta( $track_id, TRACK_DURATION_META_KEY, true ) ),
		'artwork'  => sanitize_external_url( get_post_meta( $track_id, TRACK_ARTWORK_META_KEY, true ) ),
		'lyrics'   => sanitize_textarea_field( get_post_meta( $track_id, TRACK_LYRICS_META_KEY, true ) ),
		'guid'     => sanitize_track_meta( get_post_meta( $track_id, TRACK_GUID_META_KEY, true ), TRACK_GUID_META_KEY ),
	);
}

function term_names_from_param( $value ): array {
	return array_values(
		array_filter(
			array_map(
				'sanitize_text_field',
				array_map( 'trim', explode( ',', (string) $value ) )
			)
		)
	);
}

class CLI_Migrate_Tracks_Command {
	/**
	 * Convert inline external track refs to central registry refs.
	 *
	 * ## OPTIONS
	 *
	 * [--write]
	 * : Persist converted post content. Defaults to dry-run.
	 *
	 * [--post_id=<id>]
	 * : Limit migration to one post.
	 *
	 * ## EXAMPLES
	 *
	 *     wp jtpp migrate-tracks --url=https://example.test
	 *     wp jtpp migrate-tracks --url=https://example.test --write
	 */
	public function __invoke( array $args, array $assoc_args ): void {
		$write   = ! empty( $assoc_args['write'] );
		$post_id = isset( $assoc_args['post_id'] ) ? (int) $assoc_args['post_id'] : 0;
		$posts   = $post_id ? array_filter( array( get_post( $post_id ) ) ) : get_posts(
			array(
				'post_type'      => 'any',
				'post_status'    => array( 'publish', 'draft', 'private', 'future' ),
				'posts_per_page' => -1,
				's'              => 'wp:jtpp/',
			)
		);
		$totals  = array(
			'posts'     => 0,
			'converted' => 0,
			'existing'  => 0,
			'created'   => 0,
			'dry_create' => 0,
			'skipped'   => 0,
		);

		foreach ( $posts as $post ) {
			if ( ! has_blocks( $post->post_content ) ) {
				continue;
			}

			$result = migrate_track_refs_in_content( $post->post_content, $write );
			if ( ! $result['converted'] && ! $result['dry_create'] && ! $result['skipped'] ) {
				continue;
			}

			$totals['posts']++;
			foreach ( array( 'converted', 'existing', 'created', 'dry_create', 'skipped' ) as $key ) {
				$totals[ $key ] += $result[ $key ];
			}

			\WP_CLI::log(
				sprintf(
					'%s post %d: converted=%d existing=%d created=%d dry-create=%d skipped=%d',
					$write ? 'Updated' : 'Would update',
					$post->ID,
					$result['converted'],
					$result['existing'],
					$result['created'],
					$result['dry_create'],
					$result['skipped']
				)
			);

			if ( $write && $result['changed'] ) {
				wp_update_post(
					array(
						'ID'           => $post->ID,
						'post_content' => $result['content'],
					)
				);
			}
		}

		\WP_CLI::success(
			sprintf(
				'%s. posts=%d converted=%d existing=%d created=%d dry-create=%d skipped=%d',
				$write ? 'Migration complete' : 'Dry run complete',
				$totals['posts'],
				$totals['converted'],
				$totals['existing'],
				$totals['created'],
				$totals['dry_create'],
				$totals['skipped']
			)
		);
	}
}

/**
 * CRUD for central registry tracks (`jtpp_track`) from WP-CLI.
 *
 * All writes route through save_registry_track_from_fields()/apply_registry_track_updates()
 * so the CLI, REST API, editor, and migration share identical validation,
 * sanitization, and guid behavior. Changing a track's URL never changes its
 * stored guid, so saved loops and player state survive re-transposes/URL swaps.
 */
class CLI_Track_Command {
	private const FIELDS         = array( 'trackId', 'title', 'url', 'artist', 'album', 'duration', 'artwork', 'lyrics', 'guid' );
	private const DEFAULT_FIELDS = 'trackId,title,artist,album,duration,url';

	/**
	 * CLI flag => internal field name. Audio URL is exposed as `--audio-url`
	 * because `--url` is a reserved WP-CLI global parameter (site selection).
	 */
	private const CLI_FIELD_MAP = array(
		'title'     => 'title',
		'audio-url' => 'url',
		'artist'    => 'artist',
		'album'     => 'album',
		'duration'  => 'duration',
		'artwork'   => 'artwork',
		'lyrics'    => 'lyrics',
	);

	/**
	 * Create a new registry track.
	 *
	 * ## OPTIONS
	 *
	 * --audio-url=<url>
	 * : Audio URL. Required. (Named --audio-url because --url is reserved by WP-CLI.)
	 *
	 * [--title=<title>]
	 * : Track title. Defaults to a title derived from the URL.
	 *
	 * [--artist=<artist>]
	 * : Artist name(s), comma-separated.
	 *
	 * [--album=<album>]
	 * : Album name(s), comma-separated.
	 *
	 * [--duration=<duration>]
	 * : Human-readable duration, e.g. "4:24".
	 *
	 * [--artwork=<url>]
	 * : Artwork image URL.
	 *
	 * [--lyrics=<lyrics>]
	 * : Track lyrics (plain text; newlines preserved).
	 *
	 * [--porcelain]
	 * : Output just the new track ID.
	 *
	 * ## EXAMPLES
	 *
	 *     wp jtpp track create --audio-url=https://media.example.test/song.mp3 --title="Song" --artist="Birdtalker"
	 */
	public function create( array $args, array $assoc_args ): void {
		$saved = save_registry_track_from_fields( $this->writable_fields( $assoc_args ) );
		if ( is_wp_error( $saved ) ) {
			\WP_CLI::error( $saved->get_error_message() );
		}

		if ( ! empty( $assoc_args['porcelain'] ) ) {
			\WP_CLI::line( (string) $saved );
			return;
		}

		\WP_CLI::success( sprintf( 'Created track %d.', $saved ) );
	}

	/**
	 * Show a single registry track.
	 *
	 * ## OPTIONS
	 *
	 * <id>
	 * : Track ID.
	 *
	 * [--field=<field>]
	 * : Print just one field's value.
	 *
	 * [--fields=<fields>]
	 * : Comma-separated fields to show.
	 *
	 * [--format=<format>]
	 * : Output format.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     wp jtpp track get 36
	 *     wp jtpp track get 36 --field=guid
	 */
	public function get( array $args, array $assoc_args ): void {
		$track = get_registry_track( (int) $args[0] );
		if ( is_wp_error( $track ) ) {
			\WP_CLI::error( $track->get_error_message() );
		}

		$formatter = new \WP_CLI\Formatter( $assoc_args, self::FIELDS );
		$formatter->display_item( $track );
	}

	/**
	 * List registry tracks.
	 *
	 * ## OPTIONS
	 *
	 * [--search=<term>]
	 * : Filter by title/artist/album text, or match an exact audio URL.
	 *
	 * [--limit=<n>]
	 * : Maximum results. Default 100.
	 *
	 * [--fields=<fields>]
	 * : Comma-separated fields to show.
	 *
	 * [--format=<format>]
	 * : Output format.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 *   - ids
	 *   - count
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     wp jtpp track list
	 *     wp jtpp track list --search=Birdtalker --format=json
	 */
	public function list( array $args, array $assoc_args ): void {
		$search = isset( $assoc_args['search'] ) ? (string) $assoc_args['search'] : '';
		$limit  = isset( $assoc_args['limit'] ) ? max( 1, (int) $assoc_args['limit'] ) : 100;
		$tracks = find_registry_tracks( $search, $limit );

		$format = $assoc_args['format'] ?? 'table';
		if ( 'ids' === $format ) {
			\WP_CLI::line(
				implode(
					' ',
					array_map(
						static function ( array $track ): int {
							return (int) $track['trackId'];
						},
						$tracks
					)
				)
			);
			return;
		}

		$fields    = isset( $assoc_args['fields'] ) ? $assoc_args['fields'] : self::DEFAULT_FIELDS;
		$formatter = new \WP_CLI\Formatter( $assoc_args, explode( ',', $fields ) );
		$formatter->display_items( $tracks );
	}

	/**
	 * Update fields on an existing registry track.
	 *
	 * Only the fields you pass change; others are preserved. Changing --url does
	 * NOT change the track's stored guid (intentional, keeps saved loops working).
	 *
	 * ## OPTIONS
	 *
	 * <id>
	 * : Track ID.
	 *
	 * [--title=<title>]
	 * : New title.
	 *
	 * [--audio-url=<url>]
	 * : New audio URL. (Named --audio-url because --url is reserved by WP-CLI.)
	 *
	 * [--artist=<artist>]
	 * : New artist name(s), comma-separated. Pass "" to clear.
	 *
	 * [--album=<album>]
	 * : New album name(s), comma-separated. Pass "" to clear.
	 *
	 * [--duration=<duration>]
	 * : New duration.
	 *
	 * [--artwork=<url>]
	 * : New artwork URL.
	 *
	 * [--lyrics=<lyrics>]
	 * : New track lyrics (plain text; newlines preserved).
	 *
	 * ## EXAMPLES
	 *
	 *     wp jtpp track update 36 --title="New Title" --artist="Birdtalker"
	 */
	public function update( array $args, array $assoc_args ): void {
		$fields = $this->writable_fields( $assoc_args );
		if ( ! $fields ) {
			\WP_CLI::error( 'No updatable fields provided.' );
		}

		$saved = apply_registry_track_updates( (int) $args[0], $fields );
		if ( is_wp_error( $saved ) ) {
			\WP_CLI::error( $saved->get_error_message() );
		}

		\WP_CLI::success( sprintf( 'Updated track %d.', $saved ) );
	}

	/**
	 * Delete a registry track.
	 *
	 * ## OPTIONS
	 *
	 * <id>
	 * : Track ID.
	 *
	 * [--force]
	 * : Skip trash and permanently delete.
	 *
	 * [--yes]
	 * : Answer yes to the confirmation prompt.
	 *
	 * ## EXAMPLES
	 *
	 *     wp jtpp track delete 36 --force
	 */
	public function delete( array $args, array $assoc_args ): void {
		$id    = (int) $args[0];
		$track = get_registry_track( $id );
		if ( is_wp_error( $track ) ) {
			\WP_CLI::error( $track->get_error_message() );
		}

		$refs = count_registry_track_references( $id );
		$note = $refs
			? sprintf( ' It is still referenced by %d post(s); those playlists will show a missing track.', $refs )
			: '';
		\WP_CLI::confirm(
			sprintf( 'Delete track %d ("%s")?%s', $id, $track['title'], $note ),
			$assoc_args
		);

		$deleted = delete_registry_track( $id, ! empty( $assoc_args['force'] ) );
		if ( is_wp_error( $deleted ) ) {
			\WP_CLI::error( $deleted->get_error_message() );
		}

		\WP_CLI::success( sprintf( 'Deleted track %d.', $id ) );
	}

	/**
	 * Pull only the writable track fields that were actually supplied.
	 *
	 * @param array $assoc_args Raw CLI assoc args.
	 * @return array<string,string>
	 */
	private function writable_fields( array $assoc_args ): array {
		$fields = array();
		foreach ( self::CLI_FIELD_MAP as $flag => $field ) {
			if ( array_key_exists( $flag, $assoc_args ) ) {
				$fields[ $field ] = (string) $assoc_args[ $flag ];
			}
		}
		return $fields;
	}
}

function migrate_track_refs_in_content( string $content, bool $write = false ): array {
	$blocks = parse_blocks( $content );
	$result = array(
		'content'    => $content,
		'changed'    => false,
		'converted'  => 0,
		'existing'   => 0,
		'created'    => 0,
		'dry_create' => 0,
		'skipped'    => 0,
	);

	migrate_track_refs_in_blocks( $blocks, $write, $result );

	if ( $result['changed'] ) {
		$result['content'] = serialize_blocks( $blocks );
	}

	return $result;
}

function migrate_track_refs_in_blocks( array &$blocks, bool $write, array &$result ): void {
	foreach ( $blocks as &$block ) {
		if ( 'jtpp/playlist' === ( $block['blockName'] ?? '' ) && ! empty( $block['attrs']['tracks'] ) && is_array( $block['attrs']['tracks'] ) ) {
			foreach ( $block['attrs']['tracks'] as &$ref ) {
				$next = migrate_inline_external_track_ref( $ref, $write, $result );
				if ( $next !== $ref ) {
					$ref               = $next;
					$result['changed'] = true;
				}
			}
			unset( $ref );
		}

		if ( 'jtpp/track' === ( $block['blockName'] ?? '' ) && empty( $block['attrs']['trackId'] ) && empty( $block['attrs']['id'] ) && ! empty( $block['attrs']['externalUrl'] ) ) {
			$ref  = array(
				'url'      => $block['attrs']['externalUrl'] ?? '',
				'title'    => $block['attrs']['externalTitle'] ?? '',
				'artist'   => $block['attrs']['externalArtist'] ?? '',
				'album'    => $block['attrs']['externalAlbum'] ?? '',
				'artwork'  => $block['attrs']['externalArtwork'] ?? '',
				'duration' => $block['attrs']['externalDuration'] ?? '',
				'lyrics'   => $block['attrs']['lyrics'] ?? '',
			);
			$next = migrate_inline_external_track_ref( $ref, $write, $result );
			if ( ! empty( $next['trackId'] ) ) {
				$block['attrs']['trackId'] = $next['trackId'];
				$block['attrs']['source']  = 'track';
				$result['changed']         = true;
			}
		}

		if ( ! empty( $block['innerBlocks'] ) ) {
			migrate_track_refs_in_blocks( $block['innerBlocks'], $write, $result );
		}
	}
	unset( $block );
}

function migrate_inline_external_track_ref( array $ref, bool $write, array &$result ): array {
	if ( ! empty( $ref['id'] ) || ! empty( $ref['trackId'] ) ) {
		return $ref;
	}

	$url = sanitize_external_url( $ref['url'] ?? '' );
	if ( ! $url ) {
		$result['skipped']++;
		return $ref;
	}

	$track_id = find_registry_track_by_url( $url );
	if ( $track_id ) {
		$result['existing']++;
	} elseif ( $write ) {
		$track_id = save_registry_track_from_fields( $ref );
		if ( is_wp_error( $track_id ) ) {
			$result['skipped']++;
			return $ref;
		}
		$result['created']++;
	} else {
		$result['dry_create']++;
		return $ref;
	}

	$result['converted']++;
	return array(
		'trackId'     => (int) $track_id,
		'customTitle' => '',
	);
}

function find_registry_track_by_url( string $url ): int {
	$posts = get_posts(
		array(
			'post_type'      => TRACK_POST_TYPE,
			'post_status'    => array( 'publish', 'draft', 'private' ),
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'meta_key'       => TRACK_URL_META_KEY,
			'meta_value'     => sanitize_external_url( $url ),
		)
	);

	return $posts ? (int) $posts[0] : 0;
}

function rest_current_user_can_manage_saved_loops(): bool {
	return is_user_logged_in();
}

function rest_get_saved_loops(): \WP_REST_Response {
	return rest_ensure_response(
		array(
			'cues' => get_current_user_loop_cues(),
		)
	);
}

function rest_update_saved_loops( \WP_REST_Request $request ): \WP_REST_Response {
	$params = $request->get_json_params();
	$cues   = normalize_user_loop_cues( $params['cues'] ?? array() );
	update_user_meta( get_current_user_id(), USER_LOOP_CUES_META_KEY, $cues );

	return rest_ensure_response(
		array(
			'cues' => $cues,
		)
	);
}

function get_current_user_loop_cues(): array {
	$cues = get_user_meta( get_current_user_id(), USER_LOOP_CUES_META_KEY, true );
	return normalize_user_loop_cues( is_array( $cues ) ? $cues : array() );
}

function normalize_user_loop_cues( array $cues ): array {
	$normalized = array();
	foreach ( $cues as $track_id => $loops ) {
		$track_id = normalize_loop_track_id( $track_id );
		if ( ! $track_id || ! is_array( $loops ) ) {
			continue;
		}
		$track_loops = array_values( array_filter( array_map( __NAMESPACE__ . '\\normalize_user_loop_cue', $loops ) ) );
		usort(
			$track_loops,
			static function ( array $a, array $b ): int {
				return ( $b['updatedAt'] ?? 0 ) <=> ( $a['updatedAt'] ?? 0 );
			}
		);
		if ( $track_loops ) {
			$normalized[ $track_id ] = array_slice( $track_loops, 0, USER_LOOP_CUES_LIMIT );
		}
	}
	return $normalized;
}

function normalize_loop_track_id( $track_id ): string {
	$track_id = (string) $track_id;
	if ( preg_match( '/^\d+$/', $track_id ) ) {
		return (string) (int) $track_id;
	}
	if ( preg_match( '/^url:[a-f0-9]{16}$/', $track_id ) ) {
		return $track_id;
	}
	return '';
}

function normalize_user_loop_cue( $loop ): ?array {
	if ( ! is_array( $loop ) ) {
		return null;
	}
	$start = isset( $loop['start'] ) ? (float) $loop['start'] : NAN;
	$end   = isset( $loop['end'] ) ? (float) $loop['end'] : NAN;
	if ( ! is_finite( $start ) || ! is_finite( $end ) || $end <= $start ) {
		return null;
	}

	$name = trim( sanitize_text_field( $loop['name'] ?? '' ) );
	$id   = trim( sanitize_text_field( $loop['id'] ?? '' ) );
	$rate = isset( $loop['rate'] ) ? (float) $loop['rate'] : 1;

	return array(
		'id'        => $id ? $id : sanitize_key( $start . '-' . $end ),
		'name'      => $name ? $name : format_storage_time( $start ) . '-' . format_storage_time( $end ),
		'start'     => $start,
		'end'       => $end,
		'rate'      => is_finite( $rate ) ? $rate : 1,
		'updatedAt' => isset( $loop['updatedAt'] ) ? (int) $loop['updatedAt'] : time() * 1000,
	);
}

function format_storage_time( float $seconds ): string {
	$safe = max( 0, (int) floor( $seconds ) );
	return floor( $safe / 60 ) . ':' . str_pad( (string) ( $safe % 60 ), 2, '0', STR_PAD_LEFT );
}

function icon( string $name ): string {
	$attrs = ' aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
	switch ( $name ) {
		case 'play':
			return '<svg' . $attrs . '><polygon points="7 5 19 12 7 19 7 5"></polygon></svg>';
		case 'pause':
			return '<svg' . $attrs . '><path d="M8 5v14"></path><path d="M16 5v14"></path></svg>';
		case 'prev':
			return '<svg' . $attrs . '><path d="M6 5v14"></path><polygon points="19 5 8 12 19 19 19 5"></polygon></svg>';
		case 'start':
			return '<svg' . $attrs . '><path d="M5 5v14"></path><path d="M19 6v12"></path><path d="m12 9-4 3 4 3"></path><path d="M19 12H8"></path></svg>';
		case 'next':
			return '<svg' . $attrs . '><path d="M18 5v14"></path><polygon points="5 5 16 12 5 19 5 5"></polygon></svg>';
		case 'back15':
			return '<svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7H6V1"></path><path d="M6.6 7.4a12 12 0 1 1-1.2 15.2"></path><text x="16" y="20" text-anchor="middle" font-size="9" font-weight="700" stroke-width="0" fill="currentColor">15</text></svg>';
		case 'fwd15':
			return '<svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h6V1"></path><path d="M25.4 7.4a12 12 0 1 0 1.2 15.2"></path><text x="16" y="20" text-anchor="middle" font-size="9" font-weight="700" stroke-width="0" fill="currentColor">15</text></svg>';
		case 'repeat':
			return '<svg' . $attrs . '><path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h18"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path></svg>';
		case 'shuffle':
			return '<svg' . $attrs . '><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="m15 15 6 6"></path><path d="M4 4l5 5"></path></svg>';
		case 'download':
			return '<svg' . $attrs . '><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>';
		case 'fullscreen':
			return '<svg' . $attrs . '><path d="M8 3H3v5"></path><path d="M16 3h5v5"></path><path d="M21 16v5h-5"></path><path d="M3 16v5h5"></path></svg>';
		case 'close':
			return '<svg' . $attrs . '><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
		case 'grip':
			return '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="9" cy="5" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>';
	}
	return '';
}
