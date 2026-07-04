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

add_action( 'init', __NAMESPACE__ . '\\register' );
function register() {
	$dir = plugin_dir_path( __FILE__ );
	$url = plugin_dir_url( __FILE__ );

	wp_register_script( 'jtpp-view', $url . 'build/view.js', array(), JTPP_VERSION, true );
	if ( file_exists( $dir . 'build/view.css' ) ) {
		wp_register_style( 'jtpp-player', $url . 'build/view.css', array(), JTPP_VERSION );
	}

	foreach ( glob( $dir . 'build/blocks/*/block.json' ) as $block_json ) {
		register_block_type( $block_json );
	}
}

function resolve_tracks( array $refs ): array {
	$tracks = array();
	foreach ( $refs as $ref ) {
		$id  = isset( $ref['id'] ) ? (int) $ref['id'] : 0;
		$url = $id ? wp_get_attachment_url( $id ) : false;
		if ( ! $url ) {
			continue;
		}
		$url      = set_url_scheme( $url );
		$meta     = wp_get_attachment_metadata( $id );
		$thumb_id = get_post_thumbnail_id( $id );
		$artwork  = $thumb_id ? wp_get_attachment_image_src( $thumb_id, 'thumbnail' ) : false;
		$tracks[] = array(
			'id'       => $id,
			'url'      => $url,
			'title'    => ! empty( $ref['customTitle'] ) ? $ref['customTitle'] : get_the_title( $id ),
			'artist'   => $meta['artist'] ?? '',
			'album'    => $meta['album'] ?? '',
			'artwork'  => $artwork ? set_url_scheme( $artwork[0] ) : '',
			'duration' => $meta['length_formatted'] ?? '',
		);
	}
	return $tracks;
}

function render_player( array $tracks, array $options ): string {
	if ( ! $tracks ) {
		return '';
	}
	wp_enqueue_script( 'jtpp-view' );
	wp_enqueue_style( 'jtpp-player' );

	$payload = array( 'tracks' => $tracks, 'options' => $options );

	ob_start();
	?>
	<script type="application/json" class="jtpp-data"><?php echo wp_json_encode( $payload ); ?></script>
	<?php if ( $options['playlist'] ) : ?>
	<div class="jtpp-shell">
	<?php endif; ?>
	<?php if ( $options['playlist'] ) : ?>
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
	<?php endif; ?>
	<div class="jtpp-panel">
		<div class="jtpp-now-playing">
			<img class="jtpp-artwork" alt="" hidden />
			<div class="jtpp-now-copy">
				<div class="jtpp-now-title"></div>
				<div class="jtpp-now-meta"></div>
			</div>
		</div>
		<div class="jtpp-waveform"></div>
		<div class="jtpp-fallback" hidden></div>
		<div class="jtpp-times"><span class="jtpp-time-current">0:00</span><span class="jtpp-time-total">0:00</span></div>
		<div class="jtpp-loop-tools" hidden>
			<button type="button" class="jtpp-loop-clear"><?php esc_html_e( 'Clear selection', 'jt-practice-player' ); ?></button>
			<div class="jtpp-zoom-controls" aria-label="<?php esc_attr_e( 'Selection zoom controls', 'jt-practice-player' ); ?>">
				<button type="button" class="jtpp-zoom-out" aria-label="<?php esc_attr_e( 'Zoom out', 'jt-practice-player' ); ?>">&minus;</button>
				<button type="button" class="jtpp-zoom-reset" aria-label="<?php esc_attr_e( 'Reset selection zoom', 'jt-practice-player' ); ?>"><?php esc_html_e( 'Fit loop', 'jt-practice-player' ); ?></button>
				<button type="button" class="jtpp-zoom-in" aria-label="<?php esc_attr_e( 'Zoom in', 'jt-practice-player' ); ?>">+</button>
			</div>
		</div>
		<div class="jtpp-controls">
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-prev" aria-label="<?php esc_attr_e( 'Previous track', 'jt-practice-player' ); ?>"><?php echo icon( 'prev' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<button type="button" class="jtpp-start" aria-label="<?php esc_attr_e( 'Back to start of track', 'jt-practice-player' ); ?>"><?php echo icon( 'start' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-back15" aria-label="<?php esc_attr_e( 'Back 15 seconds', 'jt-practice-player' ); ?>"><?php echo icon( 'back15' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<button type="button" class="jtpp-play" aria-label="<?php esc_attr_e( 'Play', 'jt-practice-player' ); ?>"><?php echo icon( 'play' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-fwd15" aria-label="<?php esc_attr_e( 'Forward 15 seconds', 'jt-practice-player' ); ?>"><?php echo icon( 'fwd15' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-next" aria-label="<?php esc_attr_e( 'Next track', 'jt-practice-player' ); ?>"><?php echo icon( 'next' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button><?php endif; ?>
			<button type="button" class="jtpp-loop" aria-label="<?php esc_attr_e( 'Toggle section loop', 'jt-practice-player' ); ?>" aria-pressed="false"><?php echo icon( 'loop' ); // phpcs:ignore WordPress.Security.EscapeOutput ?></button>
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
	<noscript>
		<?php foreach ( $tracks as $track ) : ?>
		<p><?php echo esc_html( $track['title'] ); ?></p>
		<audio controls preload="none" src="<?php echo esc_url( $track['url'] ); ?>"></audio>
		<?php endforeach; ?>
	</noscript>
	<?php
	return ob_get_clean();
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
		case 'loop':
			return '<svg' . $attrs . '><path d="M17 2l4 4-4 4"></path><path d="M3 11V9a3 3 0 0 1 3-3h15"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v2a3 3 0 0 1-3 3H3"></path></svg>';
		case 'download':
			return '<svg' . $attrs . '><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>';
		case 'grip':
			return '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="9" cy="5" r="1.5"></circle><circle cx="15" cy="5" r="1.5"></circle><circle cx="9" cy="12" r="1.5"></circle><circle cx="15" cy="12" r="1.5"></circle><circle cx="9" cy="19" r="1.5"></circle><circle cx="15" cy="19" r="1.5"></circle></svg>';
	}
	return '';
}
