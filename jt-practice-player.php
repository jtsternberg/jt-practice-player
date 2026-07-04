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
