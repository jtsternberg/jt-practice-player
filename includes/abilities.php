<?php
/**
 * WordPress Abilities API adapter for the practice-player track registry.
 *
 * Exposes the same service layer used by REST (`jtpp/v1`) and WP-CLI
 * (`wp jtpp track`, `wp jtpp migrate-tracks`) as discoverable abilities so
 * agents can list, read, create, update, and delete registry tracks, and run
 * the inline-ref migration.
 *
 * Requires WordPress 6.9+ (Abilities API). On older versions the
 * `wp_abilities_api_*` hooks never fire, so nothing here runs.
 *
 * @package JTPP
 */

namespace JTPP;

defined( 'ABSPATH' ) || exit;

add_action( 'wp_abilities_api_categories_init', __NAMESPACE__ . '\\register_ability_categories' );
add_action( 'wp_abilities_api_init', __NAMESPACE__ . '\\register_abilities' );

/**
 * Register the `jtpp` ability category. Categories are mandatory and must
 * exist before the abilities that reference them are registered.
 */
function register_ability_categories(): void {
	if ( ! function_exists( 'wp_register_ability_category' ) ) {
		return;
	}

	wp_register_ability_category(
		'jtpp',
		array(
			'label'       => __( 'JT Practice Player', 'jt-practice-player' ),
			'description' => __( 'Manages the JT Practice Player track registry: the audio tracks (with artist, album, artwork, duration, and lyrics) that the practice playlist and single-track blocks reference by ID.', 'jt-practice-player' ),
		)
	);
}

/**
 * The canonical registry-track shape returned by rest_prepare_track().
 *
 * Defined once and reused by every ability that returns a track so agents see
 * one consistent schema.
 *
 * @return array
 */
function track_output_schema(): array {
	return array(
		'type'                 => 'object',
		'properties'           => array(
			'trackId'  => array(
				'type'        => 'integer',
				'description' => __( 'Registry track post ID. Use this to reference the track in later calls and in playlist blocks.', 'jt-practice-player' ),
			),
			'url'      => array(
				'type'        => 'string',
				'description' => __( 'Audio file URL the player loads.', 'jt-practice-player' ),
			),
			'title'    => array(
				'type'        => 'string',
				'description' => __( 'Track title shown in the player and playlist rows.', 'jt-practice-player' ),
			),
			'artist'   => array(
				'type'        => 'string',
				'description' => __( 'Artist name(s), comma-separated.', 'jt-practice-player' ),
			),
			'album'    => array(
				'type'        => 'string',
				'description' => __( 'Album name(s), comma-separated.', 'jt-practice-player' ),
			),
			'duration' => array(
				'type'        => 'string',
				'description' => __( 'Human-readable duration, e.g. "4:24".', 'jt-practice-player' ),
			),
			'artwork'  => array(
				'type'        => 'string',
				'description' => __( 'Album art image URL.', 'jt-practice-player' ),
			),
			'lyrics'   => array(
				'type'        => 'string',
				'description' => __( 'Track lyrics as plain text; newlines preserved.', 'jt-practice-player' ),
			),
			'guid'     => array(
				'type'        => 'string',
				'description' => __( 'Stable player identity (`url:<hash>`) used to key saved loop cues and browser playback state. It is derived from the URL at creation time and deliberately does not change when the URL changes, so saved loops survive re-transposes and URL swaps.', 'jt-practice-player' ),
			),
		),
		'required'             => array( 'trackId', 'url', 'title', 'artist', 'album', 'duration', 'artwork', 'lyrics', 'guid' ),
		'additionalProperties' => false,
	);
}

/**
 * Input schema fragments for the writable track fields.
 *
 * @return array<string,array>
 */
function track_input_field_schemas(): array {
	return array(
		'url'      => array(
			'type'        => 'string',
			'description' => __( 'Audio file URL (http/https) the player should load.', 'jt-practice-player' ),
		),
		'title'    => array(
			'type'        => 'string',
			'description' => __( 'Track title. When omitted on create, a title is derived from the URL filename.', 'jt-practice-player' ),
		),
		'artist'   => array(
			'type'        => 'string',
			'description' => __( 'Artist name(s), comma-separated. Pass an empty string to clear.', 'jt-practice-player' ),
		),
		'album'    => array(
			'type'        => 'string',
			'description' => __( 'Album name(s), comma-separated. Pass an empty string to clear.', 'jt-practice-player' ),
		),
		'duration' => array(
			'type'        => 'string',
			'description' => __( 'Human-readable duration, e.g. "4:24". Display only; the player measures real length from the audio.', 'jt-practice-player' ),
		),
		'artwork'  => array(
			'type'        => 'string',
			'description' => __( 'Album art image URL.', 'jt-practice-player' ),
		),
		'lyrics'   => array(
			'type'        => 'string',
			'description' => __( 'Track lyrics as plain text; newlines are preserved.', 'jt-practice-player' ),
		),
	);
}

/**
 * Pull only the writable track fields that were actually supplied, mirroring
 * CLI_Track_Command::writable_fields(). Keys absent or null are left out so
 * partial updates preserve the stored values.
 *
 * @param array $input Validated ability input.
 * @return array<string,string>
 */
function ability_writable_fields( array $input ): array {
	$fields = array();
	foreach ( array_keys( track_input_field_schemas() ) as $key ) {
		if ( array_key_exists( $key, $input ) && null !== $input[ $key ] ) {
			$fields[ $key ] = (string) $input[ $key ];
		}
	}

	return $fields;
}

/**
 * Standard track-returning result, or the WP_Error from the service layer.
 *
 * @param int|\WP_Error $saved_id Saved track ID or error.
 * @return array|\WP_Error
 */
function ability_track_result( $saved_id ) {
	if ( is_wp_error( $saved_id ) ) {
		return $saved_id;
	}

	$track = get_registry_track( (int) $saved_id );
	if ( is_wp_error( $track ) ) {
		return $track;
	}

	return array( 'track' => $track );
}

/**
 * Register every practice-player ability.
 */
function register_abilities(): void {
	if ( ! function_exists( 'wp_register_ability' ) ) {
		return;
	}

	$track_fields = track_input_field_schemas();
	$can_edit     = __NAMESPACE__ . '\\rest_current_user_can_edit_tracks';

	wp_register_ability(
		'jtpp/list-tracks',
		array(
			'label'               => __( 'List practice tracks', 'jt-practice-player' ),
			'description'         => __( 'Searches the practice-player track registry and returns matching tracks with their full field set. Use it to find a track ID before reading, updating, or deleting a track, to check whether an audio file is already registered, or to browse the registry. The search term matches title, artist, and album text; if the term is an audio URL, the track with that exact URL is returned first, followed by text matches. An empty search lists recent tracks.', 'jt-practice-player' ),
			'category'            => 'jtpp',
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'search' => array(
						'type'        => 'string',
						'description' => __( 'Text to match against title, artist, and album, or an exact audio URL. Omit to list recent tracks.', 'jt-practice-player' ),
					),
					'limit'  => array(
						'type'        => 'integer',
						'description' => __( 'Maximum number of text-search results to return.', 'jt-practice-player' ),
						'minimum'     => 1,
						'maximum'     => 50,
						'default'     => 20,
					),
				),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'                 => 'object',
				'properties'           => array(
					'tracks' => array(
						'type'        => 'array',
						'description' => __( 'Matching registry tracks. Empty when nothing matches.', 'jt-practice-player' ),
						'items'       => track_output_schema(),
					),
				),
				'required'             => array( 'tracks' ),
				'additionalProperties' => false,
			),
			'execute_callback'    => static function ( array $input = array() ) {
				$limit = isset( $input['limit'] ) ? (int) $input['limit'] : 20;

				return array(
					'tracks' => find_registry_tracks( (string) ( $input['search'] ?? '' ), $limit ),
				);
			},
			'permission_callback' => $can_edit,
			'meta'                => array(
				'show_in_rest' => true,
				'annotations'  => array(
					'readonly'    => true,
					'destructive' => false,
					'idempotent'  => true,
				),
			),
		)
	);

	wp_register_ability(
		'jtpp/get-track',
		array(
			'label'               => __( 'Get practice track', 'jt-practice-player' ),
			'description'         => __( 'Returns one registry track by its ID, with title, audio URL, artist, album, duration, artwork, lyrics, and stable player guid. Use it after list-tracks to inspect a track in full, or to confirm the current values before a partial update. Returns a jtpp_track_not_found error if the ID is not a registry track.', 'jt-practice-player' ),
			'category'            => 'jtpp',
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'trackId' => array(
						'type'        => 'integer',
						'description' => __( 'Registry track post ID.', 'jt-practice-player' ),
					),
				),
				'required'             => array( 'trackId' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'                 => 'object',
				'properties'           => array(
					'track' => track_output_schema(),
				),
				'required'             => array( 'track' ),
				'additionalProperties' => false,
			),
			'execute_callback'    => static function ( array $input = array() ) {
				$track = get_registry_track( (int) $input['trackId'] );
				if ( is_wp_error( $track ) ) {
					return $track;
				}

				return array( 'track' => $track );
			},
			'permission_callback' => $can_edit,
			'meta'                => array(
				'show_in_rest' => true,
				'annotations'  => array(
					'readonly'    => true,
					'destructive' => false,
					'idempotent'  => true,
				),
			),
		)
	);

	wp_register_ability(
		'jtpp/create-track',
		array(
			'label'               => __( 'Create practice track', 'jt-practice-player' ),
			'description'         => __( 'Adds a new track to the practice-player registry so playlist and single-track blocks can reference it by ID. Only the audio URL is required; everything else is metadata shown in the player. Run list-tracks with the URL first to avoid creating a duplicate entry for audio that is already registered. Returns the created track, including the generated guid that keys saved loop cues.', 'jt-practice-player' ),
			'category'            => 'jtpp',
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => $track_fields,
				'required'             => array( 'url' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'                 => 'object',
				'properties'           => array(
					'track' => track_output_schema(),
				),
				'required'             => array( 'track' ),
				'additionalProperties' => false,
			),
			'execute_callback'    => static function ( array $input = array() ) {
				return ability_track_result( save_registry_track_from_fields( ability_writable_fields( $input ) ) );
			},
			'permission_callback' => $can_edit,
			'meta'                => array(
				'show_in_rest' => true,
				'annotations'  => array(
					'readonly'     => false,
					'destructive'  => false,
					'idempotent'   => false,
					'instructions' => __( 'Search the registry for the audio URL before creating, because repeated calls with the same URL create duplicate tracks.', 'jt-practice-player' ),
				),
			),
		)
	);

	wp_register_ability(
		'jtpp/update-track',
		array(
			'label'               => __( 'Update practice track', 'jt-practice-player' ),
			'description'         => __( 'Applies a partial update to an existing registry track. Only the fields you pass change; everything else is preserved, so you can rename a track or set lyrics without resupplying its other metadata. Pass an empty string for artist or album to clear them. Changing the audio URL deliberately does not change the track guid, so saved loop cues and playback state survive re-transposes and URL swaps. Supply at least one updatable field.', 'jt-practice-player' ),
			'category'            => 'jtpp',
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array_merge(
					array(
						'trackId' => array(
							'type'        => 'integer',
							'description' => __( 'Registry track post ID to update.', 'jt-practice-player' ),
						),
					),
					$track_fields
				),
				'required'             => array( 'trackId' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'                 => 'object',
				'properties'           => array(
					'track' => track_output_schema(),
				),
				'required'             => array( 'track' ),
				'additionalProperties' => false,
			),
			'execute_callback'    => static function ( array $input = array() ) {
				$fields = ability_writable_fields( $input );
				if ( ! $fields ) {
					return new \WP_Error(
						'jtpp_no_updatable_fields',
						__( 'No updatable fields provided. Supply at least one of url, title, artist, album, duration, artwork, or lyrics.', 'jt-practice-player' ),
						array( 'status' => 400 )
					);
				}

				return ability_track_result( apply_registry_track_updates( (int) $input['trackId'], $fields ) );
			},
			'permission_callback' => $can_edit,
			'meta'                => array(
				'show_in_rest' => true,
				'annotations'  => array(
					'readonly'    => false,
					'destructive' => false,
					'idempotent'  => true,
				),
			),
		)
	);

	wp_register_ability(
		'jtpp/delete-track',
		array(
			'label'               => __( 'Delete practice track', 'jt-practice-player' ),
			'description'         => __( 'Removes a track from the practice-player registry, to the trash by default or permanently with permanent=true. Deleting a track that pages still reference leaves those playlists showing a missing track, so this ability refuses to delete a referenced track (HTTP 409, jtpp_track_in_use) unless you pass allowReferenced=true. The returned referenceCount is how many published, draft, private, or scheduled posts referenced the track.', 'jt-practice-player' ),
			'category'            => 'jtpp',
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'trackId'         => array(
						'type'        => 'integer',
						'description' => __( 'Registry track post ID to delete.', 'jt-practice-player' ),
					),
					'permanent'       => array(
						'type'        => 'boolean',
						'description' => __( 'Skip the trash and delete the track permanently.', 'jt-practice-player' ),
						'default'     => false,
					),
					'allowReferenced' => array(
						'type'        => 'boolean',
						'description' => __( 'Delete even when posts still reference the track. Those playlists will show a missing track.', 'jt-practice-player' ),
						'default'     => false,
					),
				),
				'required'             => array( 'trackId' ),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'                 => 'object',
				'properties'           => array(
					'deleted'        => array(
						'type'        => 'boolean',
						'description' => __( 'True when the track was deleted.', 'jt-practice-player' ),
					),
					'trackId'        => array(
						'type'        => 'integer',
						'description' => __( 'ID of the deleted track.', 'jt-practice-player' ),
					),
					'referenceCount' => array(
						'type'        => 'integer',
						'description' => __( 'Number of posts that referenced the track at deletion time.', 'jt-practice-player' ),
					),
					'permanent'      => array(
						'type'        => 'boolean',
						'description' => __( 'True when the track was deleted permanently instead of trashed.', 'jt-practice-player' ),
					),
				),
				'required'             => array( 'deleted', 'trackId', 'referenceCount', 'permanent' ),
				'additionalProperties' => false,
			),
			'execute_callback'    => static function ( array $input = array() ) {
				$track_id  = (int) $input['trackId'];
				$permanent = ! empty( $input['permanent'] );
				$allow     = ! empty( $input['allowReferenced'] );
				$refs      = count_registry_track_references( $track_id );

				if ( 0 < $refs && ! $allow ) {
					return new \WP_Error(
						'jtpp_track_in_use',
						sprintf(
							/* translators: 1: track ID, 2: number of posts referencing the track. */
							__( 'Track %1$d is referenced by %2$d post(s); those playlists would show a missing track. Pass allowReferenced=true to delete it anyway.', 'jt-practice-player' ),
							$track_id,
							$refs
						),
						array(
							'status'         => 409,
							'referenceCount' => $refs,
						)
					);
				}

				$deleted = delete_registry_track( $track_id, $permanent );
				if ( is_wp_error( $deleted ) ) {
					return $deleted;
				}

				return array(
					'deleted'        => true,
					'trackId'        => $track_id,
					'referenceCount' => $refs,
					'permanent'      => $permanent,
				);
			},
			'permission_callback' => static function ( array $input = array() ) {
				return current_user_can( 'delete_post', isset( $input['trackId'] ) ? (int) $input['trackId'] : 0 );
			},
			'meta'                => array(
				'show_in_rest' => true,
				'annotations'  => array(
					'readonly'     => false,
					'destructive'  => true,
					'idempotent'   => false,
					'instructions' => __( 'Check references first: deleting a track that pages still reference leaves those playlists with a missing track. Read the referenceCount in the jtpp_track_in_use error and confirm with the user before retrying with allowReferenced=true.', 'jt-practice-player' ),
				),
			),
		)
	);

	$migrate_post_schema = array(
		'type'                 => 'object',
		'properties'           => array(
			'postId'    => array(
				'type'        => 'integer',
				'description' => __( 'ID of the post that was (or would be) updated.', 'jt-practice-player' ),
			),
			'converted' => array(
				'type'        => 'integer',
				'description' => __( 'Inline external track refs converted to registry refs in this post.', 'jt-practice-player' ),
			),
			'existing'  => array(
				'type'        => 'integer',
				'description' => __( 'Refs matched to a registry track that already existed.', 'jt-practice-player' ),
			),
			'created'   => array(
				'type'        => 'integer',
				'description' => __( 'Registry tracks created for this post. Always 0 on a dry run.', 'jt-practice-player' ),
			),
			'dryCreate' => array(
				'type'        => 'integer',
				'description' => __( 'Registry tracks that a write run would create for this post.', 'jt-practice-player' ),
			),
			'skipped'   => array(
				'type'        => 'integer',
				'description' => __( 'Refs left untouched because they could not be resolved to a track.', 'jt-practice-player' ),
			),
			'changed'   => array(
				'type'        => 'boolean',
				'description' => __( 'True when the post content differs from what is stored.', 'jt-practice-player' ),
			),
		),
		'required'             => array( 'postId', 'converted', 'existing', 'created', 'dryCreate', 'skipped', 'changed' ),
		'additionalProperties' => false,
	);

	wp_register_ability(
		'jtpp/migrate-track-refs',
		array(
			'label'               => __( 'Migrate inline track refs', 'jt-practice-player' ),
			'description'         => __( 'Scans posts for practice-player blocks that still store audio inline and converts those refs to central registry refs, creating registry tracks where needed. Use it once per site after adopting the track registry, or for a single post with postId. It defaults to a dry run (write=false) that reports exactly what a write run would change without touching anything; call it again with write=true to persist. Counts are reported per post and as totals.', 'jt-practice-player' ),
			'category'            => 'jtpp',
			'input_schema'        => array(
				'type'                 => 'object',
				'properties'           => array(
					'write'  => array(
						'type'        => 'boolean',
						'description' => __( 'Persist converted post content. Leave false for a dry run.', 'jt-practice-player' ),
						'default'     => false,
					),
					'postId' => array(
						'type'        => 'integer',
						'description' => __( 'Limit the migration to one post. Omit to scan every post with practice-player blocks.', 'jt-practice-player' ),
					),
				),
				'additionalProperties' => false,
			),
			'output_schema'       => array(
				'type'                 => 'object',
				'properties'           => array(
					'write'  => array(
						'type'        => 'boolean',
						'description' => __( 'False when this was a dry run and nothing was persisted.', 'jt-practice-player' ),
					),
					'posts'  => array(
						'type'        => 'array',
						'description' => __( 'Per-post results, only for posts with something to convert.', 'jt-practice-player' ),
						'items'       => $migrate_post_schema,
					),
					'totals' => array(
						'type'                 => 'object',
						'description'          => __( 'Totals across every affected post.', 'jt-practice-player' ),
						'properties'           => array(
							'posts'     => array(
								'type'        => 'integer',
								'description' => __( 'Posts with at least one ref to convert.', 'jt-practice-player' ),
							),
							'converted' => array(
								'type'        => 'integer',
								'description' => __( 'Total refs converted to registry refs.', 'jt-practice-player' ),
							),
							'existing'  => array(
								'type'        => 'integer',
								'description' => __( 'Total refs matched to already-existing registry tracks.', 'jt-practice-player' ),
							),
							'created'   => array(
								'type'        => 'integer',
								'description' => __( 'Total registry tracks created. Always 0 on a dry run.', 'jt-practice-player' ),
							),
							'dryCreate' => array(
								'type'        => 'integer',
								'description' => __( 'Total registry tracks a write run would create.', 'jt-practice-player' ),
							),
							'skipped'   => array(
								'type'        => 'integer',
								'description' => __( 'Total refs left untouched.', 'jt-practice-player' ),
							),
						),
						'required'             => array( 'posts', 'converted', 'existing', 'created', 'dryCreate', 'skipped' ),
						'additionalProperties' => false,
					),
				),
				'required'             => array( 'write', 'posts', 'totals' ),
				'additionalProperties' => false,
			),
			'execute_callback'    => static function ( array $input = array() ) {
				return migrate_all_track_refs(
					! empty( $input['write'] ),
					isset( $input['postId'] ) ? (int) $input['postId'] : 0
				);
			},
			// Rewrites arbitrary posts' content site-wide, so this is an admin
			// operation rather than an edit_posts one.
			'permission_callback' => static function ( array $input = array() ) {
				return current_user_can( 'manage_options' );
			},
			'meta'                => array(
				'show_in_rest' => true,
				'annotations'  => array(
					'readonly'     => false,
					'destructive'  => true,
					'idempotent'   => true,
					'instructions' => __( 'Always run with write=false first and review the reported counts with the user before running again with write=true. A write run rewrites post content and can create registry tracks.', 'jt-practice-player' ),
				),
			),
		)
	);
}
