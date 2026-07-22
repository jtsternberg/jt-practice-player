<?php

use PHPUnit\Framework\TestCase;

final class TrackCrudTest extends TestCase {
	protected function setUp(): void {
		$GLOBALS['jtpp_test_posts']   = array();
		$GLOBALS['jtpp_test_meta']    = array();
		$GLOBALS['jtpp_test_terms']   = array();
		$GLOBALS['jtpp_test_next_id'] = 100;
	}

	private function seed_track( int $id, array $meta = array(), array $terms = array() ): void {
		$GLOBALS['jtpp_test_posts'][ $id ] = (object) array(
			'ID'          => $id,
			'post_type'   => JTPP\TRACK_POST_TYPE,
			'post_status' => 'publish',
		);
		$GLOBALS['jtpp_test_meta'][ $id ]  = $meta;
		$GLOBALS['jtpp_test_terms'][ $id ] = $terms;
	}

	/* ---- create / update via save_registry_track_from_fields ---- */

	public function test_create_inserts_track_and_sets_guid_from_url(): void {
		$id = JTPP\save_registry_track_from_fields(
			array(
				'title'    => 'New Song',
				'url'      => 'https://media.example.test/new.mp3',
				'artist'   => 'Birdtalker',
				'album'    => 'One',
				'duration' => '3:42',
			)
		);

		$this->assertIsInt( $id );
		$this->assertSame( 'https://media.example.test/new.mp3', $GLOBALS['jtpp_test_meta'][ $id ][ JTPP\TRACK_URL_META_KEY ] );
		$this->assertSame(
			'url:' . substr( md5( 'https://media.example.test/new.mp3' ), 0, 16 ),
			$GLOBALS['jtpp_test_meta'][ $id ][ JTPP\TRACK_GUID_META_KEY ]
		);
		$this->assertSame( 'Birdtalker', $GLOBALS['jtpp_test_terms'][ $id ][ JTPP\TRACK_ARTIST_TAXONOMY ][0]->name );
	}

	public function test_create_stores_lyrics_as_track_meta(): void {
		$id = JTPP\save_registry_track_from_fields(
			array(
				'title'  => 'With Lyrics',
				'url'    => 'https://media.example.test/lyrics.mp3',
				'lyrics' => "verse one\nverse two",
			)
		);

		$this->assertIsInt( $id );
		$this->assertSame( "verse one\nverse two", $GLOBALS['jtpp_test_meta'][ $id ][ JTPP\TRACK_LYRICS_META_KEY ] );
		$this->assertSame( "verse one\nverse two", JTPP\get_registry_track( $id )['lyrics'] );
	}

	public function test_partial_update_changes_lyrics_and_preserves_them_otherwise(): void {
		$this->seed_track(
			42,
			array(
				JTPP\TRACK_URL_META_KEY    => 'https://media.example.test/song.mp3',
				JTPP\TRACK_GUID_META_KEY   => 'url:1234abcd5678ef90',
				JTPP\TRACK_LYRICS_META_KEY => 'original lyrics',
			)
		);

		// A title-only update leaves lyrics untouched.
		JTPP\apply_registry_track_updates( 42, array( 'title' => 'Renamed' ) );
		$this->assertSame( 'original lyrics', $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_LYRICS_META_KEY ] );

		// Updating lyrics replaces them.
		JTPP\apply_registry_track_updates( 42, array( 'lyrics' => 'updated lyrics' ) );
		$this->assertSame( 'updated lyrics', $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_LYRICS_META_KEY ] );
	}

	public function test_create_without_url_returns_wp_error(): void {
		$result = JTPP\save_registry_track_from_fields( array( 'title' => 'No URL' ) );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_url_required', $result->get_error_code() );
	}

	public function test_update_keeps_guid_when_url_changes(): void {
		$this->seed_track(
			42,
			array(
				JTPP\TRACK_URL_META_KEY  => 'https://media.example.test/first.mp3',
				JTPP\TRACK_GUID_META_KEY => 'url:1234abcd5678ef90',
			)
		);

		$id = JTPP\save_registry_track_from_fields(
			array(
				'trackId' => 42,
				'title'   => 'Retransposed',
				'url'     => 'https://media.example.test/second.mp3',
			)
		);

		$this->assertSame( 42, $id );
		$this->assertSame( 'https://media.example.test/second.mp3', $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_URL_META_KEY ] );
		$this->assertSame( 'url:1234abcd5678ef90', $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_GUID_META_KEY ] );
	}

	/* ---- get_registry_track ---- */

	public function test_get_registry_track_returns_prepared_fields(): void {
		$this->seed_track(
			42,
			array(
				JTPP\TRACK_URL_META_KEY      => 'https://media.example.test/song.mp3',
				JTPP\TRACK_GUID_META_KEY     => 'url:1234abcd5678ef90',
				JTPP\TRACK_DURATION_META_KEY => '4:24',
			),
			array(
				JTPP\TRACK_ARTIST_TAXONOMY => array( (object) array( 'name' => 'Birdtalker' ) ),
			)
		);

		$track = JTPP\get_registry_track( 42 );

		$this->assertSame( 42, $track['trackId'] );
		$this->assertSame( 'https://media.example.test/song.mp3', $track['url'] );
		$this->assertSame( 'Birdtalker', $track['artist'] );
		$this->assertSame( 'url:1234abcd5678ef90', $track['guid'] );
	}

	public function test_get_registry_track_missing_returns_wp_error(): void {
		$result = JTPP\get_registry_track( 999 );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_not_found', $result->get_error_code() );
	}

	public function test_get_registry_track_wrong_post_type_returns_wp_error(): void {
		$GLOBALS['jtpp_test_posts'][7] = (object) array(
			'ID'        => 7,
			'post_type' => 'page',
		);

		$result = JTPP\get_registry_track( 7 );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_not_found', $result->get_error_code() );
	}

	/* ---- apply_registry_track_updates (partial update) ---- */

	public function test_partial_update_preserves_unspecified_fields(): void {
		$this->seed_track(
			42,
			array(
				JTPP\TRACK_URL_META_KEY  => 'https://media.example.test/song.mp3',
				JTPP\TRACK_GUID_META_KEY => 'url:1234abcd5678ef90',
			),
			array(
				JTPP\TRACK_ARTIST_TAXONOMY => array( (object) array( 'name' => 'Birdtalker' ) ),
			)
		);

		$id = JTPP\apply_registry_track_updates( 42, array( 'title' => 'Renamed Only' ) );

		$this->assertSame( 42, $id );
		$this->assertSame( 'https://media.example.test/song.mp3', $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_URL_META_KEY ] );
		$this->assertSame( 'Birdtalker', $GLOBALS['jtpp_test_terms'][42][ JTPP\TRACK_ARTIST_TAXONOMY ][0]->name );
		$this->assertSame( 'url:1234abcd5678ef90', $GLOBALS['jtpp_test_meta'][42][ JTPP\TRACK_GUID_META_KEY ] );
	}

	public function test_partial_update_missing_track_returns_wp_error(): void {
		$result = JTPP\apply_registry_track_updates( 999, array( 'title' => 'X' ) );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_not_found', $result->get_error_code() );
	}

	/* ---- delete_registry_track ---- */

	public function test_delete_registry_track_removes_existing_track(): void {
		$this->seed_track( 42, array( JTPP\TRACK_URL_META_KEY => 'https://media.example.test/song.mp3' ) );

		$result = JTPP\delete_registry_track( 42, true );

		$this->assertTrue( $result );
		$this->assertArrayNotHasKey( 42, $GLOBALS['jtpp_test_posts'] );
	}

	public function test_delete_registry_track_missing_returns_wp_error(): void {
		$result = JTPP\delete_registry_track( 999, true );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_not_found', $result->get_error_code() );
	}

	public function test_delete_registry_track_wrong_post_type_returns_wp_error(): void {
		$GLOBALS['jtpp_test_posts'][7] = (object) array(
			'ID'        => 7,
			'post_type' => 'page',
		);

		$result = JTPP\delete_registry_track( 7, true );

		$this->assertTrue( is_wp_error( $result ) );
	}
}
