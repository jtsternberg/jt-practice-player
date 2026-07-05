# External URL Track Editor UI Plan

This plan is for the editor-side implementation only. The PHP render layer already accepts the data shapes described here and normalizes them into the existing front-end track payload.

## Goal

Let authors build Practice Playlist and Practice Track blocks from either WordPress Media Library audio attachments or manually entered external audio URLs.

The front-end player should not care which source was used. The editor saves enough track data for PHP to resolve a playable track without fetching remote metadata.

## Data Contract

### Playlist Track Items

The `jtpp/playlist` block keeps the existing `tracks` array. Each item may be one of two shapes.

Attachment-backed track:

```json
{
	"id": 123,
	"customTitle": "Optional display title"
}
```

External URL track:

```json
{
	"url": "https://example.com/audio/song.mp3",
	"title": "Song title",
	"artist": "Artist name",
	"album": "Album or set name",
	"artwork": "https://example.com/images/song.jpg",
	"duration": "3:42"
}
```

Notes:

- If `id` is present and resolves to a Media Library attachment, PHP treats the item as attachment-backed.
- If there is no valid `id`, PHP falls back to `url`.
- `title`, `artist`, `album`, `artwork`, and `duration` are optional for external tracks.
- PHP will derive a display title from the URL filename if `title` is empty.

### Single Track Attributes

The `jtpp/track` block keeps its existing Media Library attributes and adds external URL attributes:

```json
{
	"id": 123,
	"customTitle": "Optional attachment title override",
	"externalUrl": "https://example.com/audio/song.mp3",
	"externalTitle": "Song title",
	"externalArtist": "Artist name",
	"externalAlbum": "Album or set name",
	"externalArtwork": "https://example.com/images/song.jpg",
	"externalDuration": "3:42"
}
```

Render precedence:

1. If `id` resolves to an attachment, render the attachment.
2. Otherwise, if `externalUrl` is valid, render the external track.
3. Otherwise, render nothing.

## Playlist Editor UI

Keep the current Media Library flow intact:

- `MediaPlaceholder` for the empty state.
- `MediaUpload` / "Add tracks" for adding attachment-backed tracks.
- Existing custom title, move, drag, and remove behavior.

Add an "Add external URL" control near the existing "Add tracks" button.

Recommended flow:

1. Click "Add external URL".
2. Insert a new external track row at the end of `tracks`.
3. Focus the URL field.
4. Let the author fill title/artist/album/artwork/duration inline.

External track row fields:

- URL: required, plain URL input.
- Title: recommended, text input.
- Artist: optional, text input.
- Album: optional, text input.
- Artwork URL: optional, URL input.
- Duration: optional, short text input. Do not try to auto-parse remote duration in v1.

Row affordances should remain consistent with attachment rows:

- Same drag handle.
- Same move up/down buttons.
- Same remove button.
- Same drop-slot behavior.

Suggested compact row layout:

- First line: drag handle, title field, remove/move controls.
- Second line: URL field.
- Third line: artist, album, duration.
- Fourth line: artwork URL, if space allows.

Avoid nesting a card inside the current editor track card.

## Single Track Editor UI

Use a simple source switch:

- Media Library
- External URL

Recommended implementation:

- Add a block attribute such as `source` with values `media` or `external`.
- If `source` is absent, infer it:
  - `id > 0` means `media`.
  - non-empty `externalUrl` means `external`.
  - default to `media`.

Media mode:

- Keep the current MediaPlaceholder / Replace audio file behavior.
- Preserve existing `customTitle`.

External URL mode:

- Show fields for:
  - Audio URL
  - Title
  - Artist
  - Album
  - Artwork URL
  - Duration
- Show a small notice if the URL is cross-origin:
  - "Waveform loading depends on the remote host allowing browser audio fetches. If not, the player falls back to native audio controls."

Do not fetch the remote file from the editor in v1.

## Validation

Editor validation should be helpful but not overbearing:

- Require URL field before showing a complete external track.
- Use `URL` parsing client-side only to warn about invalid URL shape.
- Do not block save because metadata fields are empty.
- Do not fetch remote URLs from the editor.

PHP will sanitize and ignore invalid external URLs at render time.

## Backward Compatibility

Existing blocks should keep working without migration.

- Existing playlist tracks with `{ id, customTitle }` still render the same.
- Existing single-track blocks with `id` still render the same.
- New external fields are additive.

## Suggested Test Checklist

- Add a playlist with only Media Library tracks. Confirm no behavior changed.
- Add a playlist with one external URL track. Confirm it renders on the front end.
- Add a mixed playlist and reorder all row types.
- Remove an external track.
- Confirm external title/artist/album/duration appear on the front end.
- Confirm an external artwork URL appears in the now-playing panel.
- Confirm invalid external URLs do not render broken rows.
- Confirm localStorage persistence works for external tracks after reload.
- Confirm WaveSurfer fallback works if a remote host blocks waveform loading.
- Confirm Single Track media mode still works.
- Confirm Single Track external mode renders when no attachment ID is selected.
