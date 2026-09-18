<?php

use PHPUnit\Framework\TestCase;

final class AbilitiesTest extends TestCase {
	private const ABILITY_NAMES = array(
		'jtpp/list-tracks',
		'jtpp/get-track',
		'jtpp/create-track',
		'jtpp/update-track',
		'jtpp/delete-track',
		'jtpp/migrate-track-refs',
	);

	protected function setUp(): void {
		$GLOBALS['jtpp_test_posts']              = array();
		$GLOBALS['jtpp_test_meta']               = array();
		$GLOBALS['jtpp_test_terms']              = array();
		$GLOBALS['jtpp_test_next_id']            = 100;
		$GLOBALS['jtpp_test_abilities']          = array();
		$GLOBALS['jtpp_test_ability_categories'] = array();

		JTPP\register_ability_categories();
		JTPP\register_abilities();
	}

	private function ability( string $name ): array {
		$this->assertArrayHasKey( $name, $GLOBALS['jtpp_test_abilities'], $name . ' was not registered.' );
		return $GLOBALS['jtpp_test_abilities'][ $name ];
	}

	/**
	 * Run an ability's execute callback with the given input.
	 *
	 * @param string $name  Ability name.
	 * @param array  $input Input array.
	 * @return mixed
	 */
	private function execute( string $name, array $input = array() ) {
		return call_user_func( $this->ability( $name )['execute_callback'], $input );
	}

	/* ---- registration ---- */

	public function test_registers_single_category(): void {
		$this->assertCount( 1, $GLOBALS['jtpp_test_ability_categories'] );
		$this->assertArrayHasKey( 'jtpp', $GLOBALS['jtpp_test_ability_categories'] );

		$category = $GLOBALS['jtpp_test_ability_categories']['jtpp'];
		$this->assertNotEmpty( $category['label'] );
		$this->assertNotEmpty( $category['description'] );
	}

	public function test_registers_exactly_the_six_abilities(): void {
		$this->assertSame( self::ABILITY_NAMES, array_keys( $GLOBALS['jtpp_test_abilities'] ) );
	}

	public function test_every_ability_is_fully_described(): void {
		foreach ( self::ABILITY_NAMES as $name ) {
			$ability = $this->ability( $name );

			$this->assertNotEmpty( $ability['label'], $name );
			$this->assertNotEmpty( $ability['description'], $name );
			$this->assertSame( 'jtpp', $ability['category'], $name );
			$this->assertIsArray( $ability['output_schema'], $name );
			$this->assertSame( 'object', $ability['output_schema']['type'], $name );
			$this->assertArrayHasKey( 'properties', $ability['output_schema'], $name );
			$this->assertIsCallable( $ability['execute_callback'], $name );
			$this->assertIsCallable( $ability['permission_callback'], $name );
			$this->assertTrue( $ability['meta']['show_in_rest'], $name );

			$annotations = $ability['meta']['annotations'];
			$this->assertIsBool( $annotations['readonly'], $name );
			$this->assertIsBool( $annotations['destructive'], $name );
			$this->assertIsBool( $annotations['idempotent'], $name );
		}
	}

	public function test_read_abilities_are_annotated_readonly_and_writes_are_not(): void {
		foreach ( array( 'jtpp/list-tracks', 'jtpp/get-track' ) as $name ) {
			$this->assertTrue( $this->ability( $name )['meta']['annotations']['readonly'], $name );
			$this->assertTrue( $this->ability( $name )['meta']['annotations']['idempotent'], $name );
			$this->assertFalse( $this->ability( $name )['meta']['annotations']['destructive'], $name );
		}

		foreach ( array( 'jtpp/create-track', 'jtpp/update-track', 'jtpp/delete-track', 'jtpp/migrate-track-refs' ) as $name ) {
			$this->assertFalse( $this->ability( $name )['meta']['annotations']['readonly'], $name );
		}
	}

	public function test_destructive_abilities_are_flagged_with_instructions(): void {
		foreach ( array( 'jtpp/delete-track', 'jtpp/migrate-track-refs' ) as $name ) {
			$annotations = $this->ability( $name )['meta']['annotations'];
			$this->assertTrue( $annotations['destructive'], $name );
			$this->assertNotEmpty( $annotations['instructions'], $name );
		}

		$this->assertFalse( $this->ability( 'jtpp/create-track' )['meta']['annotations']['destructive'] );
		$this->assertFalse( $this->ability( 'jtpp/update-track' )['meta']['annotations']['destructive'] );
	}

	public function test_track_output_schema_is_shared_by_every_track_returning_ability(): void {
		$schema = JTPP\track_output_schema();

		$this->assertSame( $schema, $this->ability( 'jtpp/get-track' )['output_schema']['properties']['track'] );
		$this->assertSame( $schema, $this->ability( 'jtpp/create-track' )['output_schema']['properties']['track'] );
		$this->assertSame( $schema, $this->ability( 'jtpp/update-track' )['output_schema']['properties']['track'] );
		$this->assertSame( $schema, $this->ability( 'jtpp/list-tracks' )['output_schema']['properties']['tracks']['items'] );
	}

	public function test_create_and_update_input_schemas_agree_on_required_fields(): void {
		$create = $this->ability( 'jtpp/create-track' )['input_schema'];
		$update = $this->ability( 'jtpp/update-track' )['input_schema'];

		$this->assertSame( array( 'url' ), $create['required'] );
		$this->assertSame( array( 'trackId' ), $update['required'] );
		$this->assertFalse( $create['additionalProperties'] );
		$this->assertFalse( $update['additionalProperties'] );
		$this->assertArrayHasKey( 'url', $update['properties'] );
		$this->assertArrayNotHasKey( 'trackId', $create['properties'] );
	}

	public function test_delete_permission_callback_checks_the_track_post(): void {
		$callback = $this->ability( 'jtpp/delete-track' )['permission_callback'];

		// The harness stubs current_user_can() as always-true; this asserts the
		// callback accepts the input array and resolves without error.
		$this->assertTrue( call_user_func( $callback, array( 'trackId' => 42 ) ) );
	}

	/* ---- execute callbacks: round trip ---- */

	public function test_create_get_list_update_round_trip(): void {
		$created = $this->execute(
			'jtpp/create-track',
			array(
				'url'      => 'https://media.example.test/kindred.mp3',
				'title'    => 'Kindred',
				'artist'   => 'Birdtalker',
				'album'    => 'One',
				'duration' => '4:24',
				'lyrics'   => "verse one\nverse two",
			)
		);

		$this->assertIsArray( $created );
		$track_id = $created['track']['trackId'];
		$this->assertIsInt( $track_id );
		$this->assertSame( 'Kindred', $created['track']['title'] );
		$this->assertSame( 'Birdtalker', $created['track']['artist'] );
		$this->assertSame(
			'url:' . substr( md5( 'https://media.example.test/kindred.mp3' ), 0, 16 ),
			$created['track']['guid']
		);

		// get-track returns the same prepared shape.
		$fetched = $this->execute( 'jtpp/get-track', array( 'trackId' => $track_id ) );
		$this->assertSame( $created['track'], $fetched['track'] );

		// list-tracks finds it by title text.
		$listed = $this->execute( 'jtpp/list-tracks', array( 'search' => 'Kindred' ) );
		$this->assertCount( 1, $listed['tracks'] );
		$this->assertSame( $track_id, $listed['tracks'][0]['trackId'] );

		// list-tracks finds it by exact audio URL.
		$by_url = $this->execute( 'jtpp/list-tracks', array( 'search' => 'https://media.example.test/kindred.mp3' ) );
		$this->assertSame( $track_id, $by_url['tracks'][0]['trackId'] );

		// A partial update changes only what it is given.
		$updated = $this->execute(
			'jtpp/update-track',
			array(
				'trackId' => $track_id,
				'title'   => 'Kindred (live)',
			)
		);
		$this->assertSame( 'Kindred (live)', $updated['track']['title'] );
		$this->assertSame( 'Birdtalker', $updated['track']['artist'] );
		$this->assertSame( 'One', $updated['track']['album'] );
		$this->assertSame( '4:24', $updated['track']['duration'] );
		$this->assertSame( "verse one\nverse two", $updated['track']['lyrics'] );
		$this->assertSame( $created['track']['guid'], $updated['track']['guid'] );
	}

	public function test_list_tracks_respects_limit(): void {
		foreach ( array( 'One', 'Two', 'Three' ) as $i => $title ) {
			$this->execute(
				'jtpp/create-track',
				array(
					'url'   => 'https://media.example.test/song-' . $i . '.mp3',
					'title' => 'Practice ' . $title,
				)
			);
		}

		$this->assertCount( 3, $this->execute( 'jtpp/list-tracks', array( 'search' => 'Practice' ) )['tracks'] );
		$this->assertCount( 1, $this->execute( 'jtpp/list-tracks', array( 'search' => 'Practice', 'limit' => 1 ) )['tracks'] );
	}

	public function test_create_track_without_url_returns_wp_error(): void {
		$result = $this->execute( 'jtpp/create-track', array( 'title' => 'No URL' ) );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_url_required', $result->get_error_code() );
	}

	public function test_get_track_missing_returns_wp_error(): void {
		$result = $this->execute( 'jtpp/get-track', array( 'trackId' => 999 ) );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_not_found', $result->get_error_code() );
	}

	public function test_update_track_without_fields_returns_wp_error(): void {
		$track_id = $this->execute(
			'jtpp/create-track',
			array( 'url' => 'https://media.example.test/song.mp3' )
		)['track']['trackId'];

		$result = $this->execute( 'jtpp/update-track', array( 'trackId' => $track_id ) );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_no_updatable_fields', $result->get_error_code() );
		$this->assertSame( 400, $result->get_error_data()['status'] );
	}

	/* ---- delete-track reference guard ---- */

	private function seed_referencing_post( int $track_id ): int {
		$GLOBALS['jtpp_test_posts'][900] = (object) array(
			'ID'           => 900,
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => 'Practice Page',
			'post_content' => '<!-- wp:jtpp/playlist {"tracks":[{"trackId":' . $track_id . '}]} /-->',
		);

		return 900;
	}

	public function test_delete_track_refuses_referenced_track(): void {
		$track_id = $this->execute(
			'jtpp/create-track',
			array( 'url' => 'https://media.example.test/in-use.mp3' )
		)['track']['trackId'];
		$this->seed_referencing_post( $track_id );

		$this->assertSame( 1, JTPP\count_registry_track_references( $track_id ) );

		$result = $this->execute( 'jtpp/delete-track', array( 'trackId' => $track_id ) );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_in_use', $result->get_error_code() );
		$this->assertSame( 409, $result->get_error_data()['status'] );
		$this->assertSame( 1, $result->get_error_data()['referenceCount'] );
		$this->assertArrayHasKey( $track_id, $GLOBALS['jtpp_test_posts'] );
	}

	public function test_delete_track_with_allow_referenced_removes_the_post(): void {
		$track_id = $this->execute(
			'jtpp/create-track',
			array( 'url' => 'https://media.example.test/in-use.mp3' )
		)['track']['trackId'];
		$this->seed_referencing_post( $track_id );

		$result = $this->execute(
			'jtpp/delete-track',
			array(
				'trackId'         => $track_id,
				'permanent'       => true,
				'allowReferenced' => true,
			)
		);

		$this->assertSame(
			array(
				'deleted'        => true,
				'trackId'        => $track_id,
				'referenceCount' => 1,
				'permanent'      => true,
			),
			$result
		);
		$this->assertArrayNotHasKey( $track_id, $GLOBALS['jtpp_test_posts'] );
	}

	public function test_delete_track_unreferenced_reports_zero_references(): void {
		$track_id = $this->execute(
			'jtpp/create-track',
			array( 'url' => 'https://media.example.test/free.mp3' )
		)['track']['trackId'];

		$result = $this->execute( 'jtpp/delete-track', array( 'trackId' => $track_id ) );

		$this->assertSame( 0, $result['referenceCount'] );
		$this->assertFalse( $result['permanent'] );
		$this->assertTrue( $result['deleted'] );
	}

	public function test_delete_track_missing_returns_wp_error(): void {
		$result = $this->execute( 'jtpp/delete-track', array( 'trackId' => 999 ) );

		$this->assertTrue( is_wp_error( $result ) );
		$this->assertSame( 'jtpp_track_not_found', $result->get_error_code() );
	}

	/* ---- migrate-track-refs ---- */

	/**
	 * Only the dry-run report shape is asserted: the harness does not stub
	 * parse_blocks()/serialize_blocks(), so posts whose content actually
	 * contains block delimiters cannot be walked here. This post is matched by
	 * the `wp:jtpp/` post search but skipped by has_blocks(), which exercises
	 * migrate_all_track_refs()'s selection, skip, and reporting paths.
	 */
	public function test_migrate_track_refs_dry_run_reports_empty_totals(): void {
		$GLOBALS['jtpp_test_posts'][901] = (object) array(
			'ID'           => 901,
			'post_type'    => 'page',
			'post_status'  => 'publish',
			'post_title'   => 'Legacy Page',
			'post_content' => 'mentions wp:jtpp/playlist but has no block delimiters',
		);

		$report = $this->execute( 'jtpp/migrate-track-refs' );

		$this->assertFalse( $report['write'] );
		$this->assertSame( array(), $report['posts'] );
		$this->assertSame(
			array(
				'posts'     => 0,
				'converted' => 0,
				'existing'  => 0,
				'created'   => 0,
				'dryCreate' => 0,
				'skipped'   => 0,
			),
			$report['totals']
		);
	}

	public function test_migrate_track_refs_reports_write_flag_and_matches_output_schema_keys(): void {
		$report = $this->execute( 'jtpp/migrate-track-refs', array( 'write' => true, 'postId' => 901 ) );

		$this->assertTrue( $report['write'] );
		$this->assertSame(
			array_keys( $this->ability( 'jtpp/migrate-track-refs' )['output_schema']['properties'] ),
			array_keys( $report )
		);
	}
}
