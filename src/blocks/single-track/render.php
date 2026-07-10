<?php
namespace JTPP;

$jtpp_tracks = resolve_tracks(
	array(
		array(
			'id'          => $attributes['id'] ?? 0,
			'trackId'     => $attributes['trackId'] ?? 0,
			'customTitle' => $attributes['customTitle'] ?? '',
			'url'         => $attributes['externalUrl'] ?? '',
			'title'       => $attributes['externalTitle'] ?? '',
			'artist'      => $attributes['externalArtist'] ?? '',
			'album'       => $attributes['externalAlbum'] ?? '',
			'artwork'     => $attributes['externalArtwork'] ?? '',
			'duration'    => $attributes['externalDuration'] ?? '',
		),
	)
);
$jtpp_inner  = render_player(
	$jtpp_tracks,
	array(
		'playlist'      => false,
		'skip'          => ! empty( $attributes['showSkipButtons'] ),
		'speed'         => ! empty( $attributes['showSpeedControl'] ),
		'fullscreen'    => $attributes['showFullscreenControl'] ?? true,
		'playlistTitle' => '',
		'siteIcon'     => esc_url_raw( get_site_icon_url( 512 ) ?: '' ),
	)
);

if ( ! $jtpp_inner ) {
	return;
}
printf( '<div %s data-jtpp>%s</div>', get_block_wrapper_attributes( array( 'class' => 'jtpp', 'style' => player_style_from_attributes( $attributes ) ) ), $jtpp_inner ); // phpcs:ignore WordPress.Security.EscapeOutput
