<?php
namespace JTPP;

$jtpp_tracks = resolve_tracks( $attributes['tracks'] ?? array() );
$jtpp_inner  = render_player(
	$jtpp_tracks,
	array(
		'playlist'      => count( $jtpp_tracks ) > 1,
		'skip'          => ! empty( $attributes['showSkipButtons'] ),
		'speed'         => ! empty( $attributes['showSpeedControl'] ),
		'fullscreen'    => $attributes['showFullscreenControl'] ?? true,
		'playlistTitle'  => sanitize_text_field( $attributes['playlistTitle'] ?? '' ),
		'siteIcon'      => esc_url_raw( get_site_icon_url( 512 ) ?: '' ),
	)
);

if ( ! $jtpp_inner ) {
	return;
}
printf( '<div %s data-jtpp>%s</div>', get_block_wrapper_attributes( array( 'class' => 'jtpp', 'style' => player_style_from_attributes( $attributes ) ) ), $jtpp_inner ); // phpcs:ignore WordPress.Security.EscapeOutput
