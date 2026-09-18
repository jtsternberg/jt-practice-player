<?php

defined( 'ABSPATH' ) || define( 'ABSPATH', dirname( __DIR__, 2 ) . '/' );

function add_action() {}
function register_rest_route() {}
function plugin_dir_path() { return dirname( __DIR__, 2 ) . '/'; }
function plugin_dir_url() { return 'https://example.test/wp-content/plugins/jt-practice-player/'; }
function wp_register_script() {}
function wp_register_style() {}
function register_block_type() {}
function rest_url( $path = '' ) { return 'https://example.test/wp-json/' . $path; }
function wp_create_nonce() { return 'nonce'; }
function is_user_logged_in() { return false; }
function rest_ensure_response( $value ) { return $value; }
function update_user_meta() {}
function get_current_user_id() { return 1; }
function get_user_meta() { return array(); }
function sanitize_key( $key ) { return strtolower( preg_replace( '/[^a-z0-9_\-]/i', '', (string) $key ) ); }
function __( $text ) { return $text; }
function esc_attr_e( $text ) { echo $text; }
function esc_html_e( $text ) { echo $text; }
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES ); }
function esc_attr( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES ); }
function esc_url( $text ) { return (string) $text; }
function esc_url_raw( $url ) { return trim( (string) $url ); }
function set_url_scheme( $url ) {
	return preg_replace( '#^http://#', 'https://', (string) $url );
}
function wp_http_validate_url( $url ) {
	return filter_var( $url, FILTER_VALIDATE_URL ) ? $url : false;
}
function sanitize_text_field( $text ) { return trim( wp_strip_all_tags( (string) $text ) ); }
function sanitize_textarea_field( $text ) { return trim( strip_tags( (string) $text ) ); }
function wp_strip_all_tags( $text ) { return strip_tags( (string) $text ); }
function sanitize_hex_color( $color ) { return preg_match( '/^#[0-9a-f]{6}$/i', (string) $color ) ? $color : ''; }
function wp_parse_url( $url, $component = -1 ) { return parse_url( $url, $component ); }
function wp_json_encode( $value ) { return json_encode( $value ); }
function wp_unique_id( $prefix = '' ) { static $i = 0; return $prefix . ++$i; }
function selected() {}
function get_block_wrapper_attributes() { return ''; }
function wp_get_attachment_url() { return false; }
function wp_get_attachment_metadata() { return array(); }
function get_post_thumbnail_id() { return 0; }
function wp_get_attachment_image_src() { return false; }
function get_the_title( $id ) {
	$title = $GLOBALS['jtpp_test_posts'][ $id ]->post_title ?? '';
	return '' !== $title ? $title : 'Post ' . $id;
}
function current_user_can() { return true; }
function has_blocks( $content = '' ) { return false !== strpos( (string) $content, '<!-- wp:' ); }
function wp_enqueue_script() {}
function wp_enqueue_style() {}
function get_site_icon_url( $size = 512 ) { return 'https://example.test/icon.png'; }
if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {
		public $code;
		public $message;
		public $data;
		public function __construct( $code = '', $message = '', $data = array() ) {
			$this->code    = $code;
			$this->message = $message;
			$this->data    = $data;
		}
		public function get_error_code() { return $this->code; }
		public function get_error_message() { return $this->message; }
		public function get_error_data() { return $this->data; }
	}
}
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }

$GLOBALS['jtpp_test_posts']    = array();
$GLOBALS['jtpp_test_meta']     = array();
$GLOBALS['jtpp_test_terms']    = array();
$GLOBALS['jtpp_test_next_id']  = 100;

function wp_insert_post( $postarr, $wp_error = false ) {
	$id = ++$GLOBALS['jtpp_test_next_id'];
	$GLOBALS['jtpp_test_posts'][ $id ] = (object) array_merge(
		array( 'ID' => $id ),
		$postarr
	);
	return $id;
}
function wp_update_post( $postarr, $wp_error = false ) {
	$id = (int) ( $postarr['ID'] ?? 0 );
	if ( ! $id || empty( $GLOBALS['jtpp_test_posts'][ $id ] ) ) {
		return $wp_error ? new WP_Error( 'invalid_post', 'Invalid post ID.' ) : 0;
	}
	foreach ( $postarr as $key => $value ) {
		$GLOBALS['jtpp_test_posts'][ $id ]->$key = $value;
	}
	return $id;
}
function wp_delete_post( $id, $force = false ) {
	$id = (int) $id;
	if ( empty( $GLOBALS['jtpp_test_posts'][ $id ] ) ) {
		return false;
	}
	$post = $GLOBALS['jtpp_test_posts'][ $id ];
	unset( $GLOBALS['jtpp_test_posts'][ $id ], $GLOBALS['jtpp_test_meta'][ $id ], $GLOBALS['jtpp_test_terms'][ $id ] );
	return $post;
}
function wp_set_object_terms( $id, $names, $taxonomy ) {
	$GLOBALS['jtpp_test_terms'][ $id ][ $taxonomy ] = array_map(
		static function ( $name ) { return (object) array( 'name' => $name ); },
		(array) $names
	);
	return array();
}

function get_post( $id ) {
	return $GLOBALS['jtpp_test_posts'][ $id ] ?? null;
}
function get_post_meta( $id, $key, $single = false ) {
	$value = $GLOBALS['jtpp_test_meta'][ $id ][ $key ] ?? '';
	return $single ? $value : array( $value );
}
function update_post_meta( $id, $key, $value ) {
	$GLOBALS['jtpp_test_meta'][ $id ][ $key ] = $value;
}
/**
 * Minimal get_posts() over the in-memory post store. Supports the argument
 * shapes this plugin actually uses: post_type (incl. 'any'), post_status,
 * posts_per_page, fields=ids, meta_key/meta_value, 's' text search,
 * post__not_in, and orderby=title.
 */
function get_posts( $args = array() ) {
	$args = array_merge(
		array(
			'post_type'      => 'post',
			'post_status'    => array( 'publish' ),
			'posts_per_page' => -1,
			'fields'         => '',
			's'              => '',
			'post__not_in'   => array(),
			'orderby'        => '',
			'order'          => 'ASC',
		),
		$args
	);

	$types    = 'any' === $args['post_type'] ? null : (array) $args['post_type'];
	$statuses = (array) $args['post_status'];
	$exclude  = array_map( 'intval', (array) $args['post__not_in'] );
	$search   = (string) $args['s'];
	$found    = array();

	foreach ( $GLOBALS['jtpp_test_posts'] as $id => $post ) {
		if ( in_array( (int) $id, $exclude, true ) ) {
			continue;
		}
		if ( null !== $types && ! in_array( $post->post_type ?? '', $types, true ) ) {
			continue;
		}
		if ( $statuses && ! in_array( $post->post_status ?? 'publish', $statuses, true ) ) {
			continue;
		}
		if ( ! empty( $args['meta_key'] ) ) {
			$meta = $GLOBALS['jtpp_test_meta'][ $id ][ $args['meta_key'] ] ?? '';
			if ( (string) $meta !== (string) ( $args['meta_value'] ?? '' ) ) {
				continue;
			}
		}
		if ( '' !== $search ) {
			$haystack = ( $post->post_title ?? '' ) . "\n" . ( $post->post_content ?? '' );
			if ( false === stripos( $haystack, $search ) ) {
				continue;
			}
		}
		$found[] = $post;
	}

	if ( 'title' === $args['orderby'] ) {
		usort(
			$found,
			static function ( $a, $b ) {
				return strcasecmp( $a->post_title ?? '', $b->post_title ?? '' );
			}
		);
	}

	$limit = (int) $args['posts_per_page'];
	if ( 0 < $limit ) {
		$found = array_slice( $found, 0, $limit );
	}

	if ( 'ids' === $args['fields'] ) {
		return array_map(
			static function ( $post ) {
				return (int) $post->ID;
			},
			$found
		);
	}

	return $found;
}

$GLOBALS['jtpp_test_abilities']          = array();
$GLOBALS['jtpp_test_ability_categories'] = array();

function wp_register_ability( $name, $args ) {
	$GLOBALS['jtpp_test_abilities'][ $name ] = $args;
	return $args;
}
function wp_register_ability_category( $slug, $args ) {
	$GLOBALS['jtpp_test_ability_categories'][ $slug ] = $args;
	return $args;
}

function get_the_terms( $id, $taxonomy ) {
	return $GLOBALS['jtpp_test_terms'][ $id ][ $taxonomy ] ?? array();
}

require dirname( __DIR__, 2 ) . '/jt-practice-player.php';
