<?php

use PHPUnit\Framework\TestCase;

final class PlayerRenderTest extends TestCase {
	public function test_render_player_includes_playlist_title_and_site_icon(): void {
		$attributes = array(
			'tracks'                => array(
				array(
					'url'      => 'https://media.example.test/heavy.mp3',
					'title'    => 'Heavy',
					'artist'   => 'Birdtalker',
					'album'    => 'One',
					'artwork'  => '',
					'duration' => '4:24',
				),
			),
			'showSkipButtons'       => true,
			'showSpeedControl'      => true,
			'showFullscreenControl' => true,
			'playlistTitle'         => '7.9.26 Practice',
		);
		$GLOBALS['attributes'] = $attributes;

		ob_start();
		require dirname( __DIR__, 2 ) . '/src/blocks/playlist/render.php';
		$html = ob_get_clean();

		preg_match( '#<script[^>]+jtpp-data[^>]*>(.*?)</script>#s', $html, $matches );
		$data = json_decode( $matches[1], true );
		$this->assertSame( '7.9.26 Practice', $data['options']['playlistTitle'] );
		$this->assertSame( 'https://example.test/icon.png', $data['options']['siteIcon'] );
	}

	public function test_resolve_tracks_decodes_html_entities_in_title(): void {
		$tracks = JTPP\resolve_tracks(
			array(
				array(
					'url'    => 'https://media.example.test/sunshine.mp3',
					'title'  => 'Ain&#8217;t No Sunshine &#8211; Notting Hill',
					'artist' => 'Bill Withers',
				),
			)
		);

		// The JSON payload feeds the now-playing title via textContent, so it
		// must carry real characters, not literal HTML entities.
		$this->assertSame( 'Ain’t No Sunshine – Notting Hill', $tracks[0]['title'] );
	}
}
