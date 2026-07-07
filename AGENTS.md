# JT Practice Player Agent Notes

## Project

This repository is the `jt-practice-player` WordPress block plugin. It provides Gutenberg blocks for practice audio players, including playlist and single-track players with waveform display, A-B loop cues, playback speed controls, fullscreen mode, local persistence, and keyboard/media-key controls.

## Local UI/UX Testing

Use a local WordPress site with this plugin active for UI/UX testing. The local site should include a page that renders the practice player block with a representative playlist.

```text
LOCAL_WP_TEST_URL=<local WordPress page URL>
```

Store the actual local URL in `.env`, copied from `.env.example`. `.env` is ignored and should stay local-only.

Use the Codex in-app browser, or the active browser testing surface in the current agent environment, to inspect and test this page. Keep browser-based verification grounded in the visible page state, because the local WordPress page is the practical test surface for the player UI.

## LocalWP / WP-CLI

When working against a LocalWP site, run WordPress commands through the available LocalWP shell wrapper instead of system `wp`, `php`, `mysql`, or `composer`. For example:

```bash
wplocal plugin list --url="$LOCAL_WP_TEST_URL"
```

For multisite-safe WP-CLI work, always include the relevant `--url=` argument.

## Development Commands

```bash
npm install
npm run build
npm start
npm run lint:js
npm run lint:css
npm run test:unit
```
