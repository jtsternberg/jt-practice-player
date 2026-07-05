=== JT Practice Player ===
Contributors: jtsternberg
Tags: audio, playlist, waveform, loop, practice
Requires at least: 6.1
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later

Audio playlist and single-track blocks with waveform display and A-B section looping, for band practice.

== Description ==

Two blocks -- Practice Playlist and Practice Track -- that render a waveform player
(wavesurfer.js). Drag on the waveform to select a section and loop it while you
practice. Includes playback-speed control, +/-15s skips, per-track loop memory,
and keyboard shortcuts.

== Usage ==

Add the Practice Playlist block when you want one shared player for a list of
songs. Choose audio files from the Media Library, reorder them in the editor,
and optionally rename each track for the practice context. When audio metadata
is available, the player shows artist, album, and album art from the attachment.

Add the Practice Track block when you only need one audio file. It uses the same
front-end player as the playlist block, without playlist navigation.

On the front end, drag across the waveform to create an A-B loop region. Drag
the region handles to resize it, drag the region body to move it, and use the
loop button or the L key to turn looping on and off.

The player includes play/pause, back-to-start, previous/next for playlists,
+/-15 second skip buttons, playback-speed steps, a desktop volume slider, and
per-track downloads. Playlist rows include checkboxes for the practice rotation,
so you can keep only the songs you want in previous/next and automatic
advancement. Drag playlist rows by their handles to put songs in the order you
want for that browser.

Keyboard shortcuts work when focus is inside a player: Space toggles playback,
L toggles the loop, left/right arrows seek five seconds, Shift+left/right seek
15 seconds, and up/down arrows change speed.

Loop points, speed, playlist rotation, playlist order, and volume are saved
locally in the visitor's browser and restored when they return. Tracks start at
the beginning, or at the saved loop start when a loop exists.
