# JT Practice Player

A WordPress block plugin for band-practice audio pages.

JT Practice Player adds waveform-based audio players to the block editor, with A-B loop selection, playlist rotation, playback speed, fullscreen mode, local browser persistence, and keyboard/media-key controls.

It is built for rehearsal workflows: upload the audio files to the WordPress Media Library, drop a practice playlist into a page, and let musicians loop the bridge, slow down a tricky fill, skip unchecked songs, download files, or keep a focused fullscreen player open during practice.

## What It Does

- Adds two Gutenberg blocks:
  - **Practice Playlist**: multiple Media Library audio files with one shared player.
  - **Practice Track**: a single-file player with the same practice controls.
- Renders a waveform using `wavesurfer.js`.
- Lets users drag on the waveform to create an A-B loop region.
- Zooms into loop selections for more precise practice work.
- Supports play/pause, back-to-start, previous/next, +/-15 second skips, loop toggle, fullscreen, playback speed, and volume.
- Shows track title, artist, album, duration, album art, and per-track download links when metadata is available.
- Lets visitors reorder playlist tracks and choose which tracks are included in previous/next/auto-advance.
- Stores visitor preferences in `localStorage`, including loop points, speed, playlist order, checked tracks, and volume.
- Provides block sidebar settings for accent color, loop color, playhead color, speed controls, skip controls, and fullscreen controls.

## Why It Exists

Most embedded audio players are built for passive listening. Practice needs different behavior.

Musicians often need to replay one transition, slow down a section, skip songs that are already solid, or keep a playlist moving while working through a set. JT Practice Player turns a WordPress page into a lightweight rehearsal tool without requiring a separate app or external music service.

## Blocks

### Practice Playlist

Use this when you want a full setlist or rehearsal queue.

In the editor, choose multiple audio files from the Media Library. You can rename tracks for the practice context and reorder them before publishing. On the front end, visitors can also drag rows into their preferred order; that order is saved locally in their browser.

Playlist rows include:

- Drag handle
- Include-in-rotation checkbox
- Track title
- Artist
- Duration
- Download link

The currently playing row is highlighted, and the player stays sticky near the bottom of long playlists until the bottom of the playlist is reached.

### Practice Track

Use this when a page only needs one audio file.

It uses the same waveform, loop, speed, fullscreen, and keyboard behavior as the playlist block, without playlist-specific controls.

## Practice Controls

On the front end:

- Drag across the waveform to create a loop region.
- Drag the region handles to resize the loop.
- Drag the region body to move the loop.
- Use **Clear selection** to remove the loop and reset the zoom.
- Use **Fit loop**, zoom in, and zoom out controls for precision.
- Use playback speed from `0.5x` through `2x`.
- Use fullscreen mode for focused practice.
- Use the playlist checkboxes to decide which tracks previous/next and auto-advance should include.

## Keyboard Controls

Keyboard shortcuts work when focus is inside a player.

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `L` | Toggle loop |
| `Left Arrow` | Back 5 seconds |
| `Right Arrow` | Forward 5 seconds |
| `Shift + Left Arrow` | Back 15 seconds |
| `Shift + Right Arrow` | Forward 15 seconds |
| `Home` | Back to start of track |
| `Up Arrow` | Increase speed |
| `Down Arrow` | Decrease speed |
| Media play/pause key | Play / pause |
| Media previous/next keys | Previous / next playlist track |

## Styling

Each block can set player colors in the block sidebar:

- Accent color
- Loop selection color
- Playhead color

The player also exposes scoped CSS custom properties:

```css
.jtpp {
	--jtpp-accent: #2f7d62;
	--jtpp-loop: #d6892a;
	--jtpp-playhead: #d6422b;
}
```

## Requirements

- WordPress 6.1+
- PHP 7.4+
- Audio files uploaded as WordPress Media Library attachments

## Development

Install dependencies:

```bash
npm install
```

Build production assets:

```bash
npm run build
```

Start the watch build:

```bash
npm start
```

Run checks:

```bash
npm run lint:js
npm run lint:css
npm run test:unit
```

## YouTube Description

**Title idea:** WordPress Practice Player Plugin: Waveform Loops, Setlists, and Speed Control

**Description:**

JT Practice Player is a WordPress block plugin for band-practice audio pages. It adds a waveform player with drag-to-select A-B loops, playlist rotation, local track order, playback speed, fullscreen mode, album metadata, downloads, and keyboard/media-key controls.

In this demo, I show how to add a practice playlist from the WordPress Media Library, reorder tracks, customize the player colors, select a loop region on the waveform, slow the track down, and use the player as a rehearsal tool for a full setlist.

Useful for bands, worship teams, music teachers, rehearsal pages, and anyone who needs more than a basic embedded audio player.

**Demo outline:**

1. Add the Practice Playlist block.
2. Select audio files from the Media Library.
3. Show track metadata, album art, and downloads.
4. Reorder tracks in the editor.
5. Publish and play the playlist.
6. Drag on the waveform to create an A-B loop.
7. Resize, move, zoom, and clear the loop.
8. Change playback speed.
9. Use checklist rotation for a focused practice queue.
10. Show fullscreen mode and keyboard/media-key controls.

**Short version:**

A WordPress block plugin that turns Media Library audio files into a rehearsal-friendly practice player with waveform looping, setlist controls, playback speed, downloads, fullscreen mode, and local per-user preferences.

## License

GPL-2.0-or-later.
