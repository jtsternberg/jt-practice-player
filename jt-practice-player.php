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
		$meta     = wp_get_attachment_metadata( $id );
		$tracks[] = array(
			'id'       => $id,
			'url'      => $url,
			'title'    => ! empty( $ref['customTitle'] ) ? $ref['customTitle'] : get_the_title( $id ),
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
	<ol class="jtpp-tracklist">
		<?php foreach ( $tracks as $i => $track ) : ?>
		<li>
			<input type="checkbox" class="jtpp-queue-check" data-index="<?php echo esc_attr( $i ); ?>" checked aria-label="<?php esc_attr_e( 'Include in practice rotation', 'jt-practice-player' ); ?>" />
			<button type="button" class="jtpp-track" data-index="<?php echo esc_attr( $i ); ?>">
				<span class="jtpp-track-title"><?php echo esc_html( $track['title'] ); ?></span>
				<span class="jtpp-track-duration"><?php echo esc_html( $track['duration'] ); ?></span>
			</button>
			<a class="jtpp-download" href="<?php echo esc_url( $track['url'] ); ?>" download aria-label="<?php esc_attr_e( 'Download track', 'jt-practice-player' ); ?>">&#x2B73;</a>
		</li>
		<?php endforeach; ?>
	</ol>
	<?php endif; ?>
	<div class="jtpp-panel">
		<div class="jtpp-now-playing"></div>
		<div class="jtpp-waveform"></div>
		<div class="jtpp-fallback" hidden></div>
		<div class="jtpp-times"><span class="jtpp-time-current">0:00</span><span class="jtpp-time-total">0:00</span></div>
		<div class="jtpp-controls">
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-prev" aria-label="<?php esc_attr_e( 'Previous track', 'jt-practice-player' ); ?>">&#x23EE;</button><?php endif; ?>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-back15" aria-label="<?php esc_attr_e( 'Back 15 seconds', 'jt-practice-player' ); ?>">&#x21BA;15</button><?php endif; ?>
			<button type="button" class="jtpp-play" aria-label="<?php esc_attr_e( 'Play', 'jt-practice-player' ); ?>">&#x25B6;</button>
			<?php if ( $options['skip'] ) : ?><button type="button" class="jtpp-fwd15" aria-label="<?php esc_attr_e( 'Forward 15 seconds', 'jt-practice-player' ); ?>">&#x21BB;15</button><?php endif; ?>
			<?php if ( $options['playlist'] ) : ?><button type="button" class="jtpp-next" aria-label="<?php esc_attr_e( 'Next track', 'jt-practice-player' ); ?>">&#x23ED;</button><?php endif; ?>
			<button type="button" class="jtpp-loop" aria-label="<?php esc_attr_e( 'Toggle section loop', 'jt-practice-player' ); ?>" aria-pressed="false">&#x1F501;</button>
			<?php if ( $options['speed'] ) : ?><button type="button" class="jtpp-speed" aria-label="<?php esc_attr_e( 'Playback speed', 'jt-practice-player' ); ?>">1&times;</button><?php endif; ?>
			<input type="range" class="jtpp-volume" min="0" max="1" step="0.05" value="1" aria-label="<?php esc_attr_e( 'Volume', 'jt-practice-player' ); ?>" />
		</div>
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
