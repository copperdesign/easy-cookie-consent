# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file, zero-dependency, no-build-step ES module: a click-to-load consent gate for third-party embeds (YouTube, Vimeo, SoundCloud, Google Maps, Sheets, Calendar, etc.), plus an optional global consent modal and deferred-load hooks for Google Fonts and arbitrary callbacks. Published to npm as `@copperdesign/easy-cookie-consent`.

The whole module is `index.js`. There is no `src/`, no bundler, no transpile. Browser APIs only, targeting 2020+ evergreens (anything with `localStorage` and `replaceChildren`).

## Development

There is no install step — the package declares no dependencies, runtime or dev. To exercise the module:

```bash
python3 -m http.server 8000
# visit http://localhost:8000/example.html
```

File-protocol won't work; ES modules require `http(s)://`.

### Checks

CI's only job is a parse-and-metadata smoke test (no test suite exists):

```bash
node --check index.js                                            # parse the module
node -e "JSON.parse(require('fs').readFileSync('package.json'))"  # validate package.json
head -n 1 index.js | grep -q '^/\*!'                              # preserve banner intact
node scripts/check-versions.mjs                                   # banner + README CDN pins match package.json
```

`scripts/` is the only non-shipped code in the repo — `package.json`'s `files` allowlist keeps it out of the npm tarball, so the single-file property holds.

Real verification is manual against `example.html` in a fresh browser (private window for fresh `localStorage`), confirming: modal shows first visit → "Allow all" swaps embeds → reload skips modal; "Not now" closes without persisting → reload re-shows; per-embed "remember" tick persists for that provider only. Spot-check in a non-Chromium browser — mobile Safari catches private-mode storage edge cases.

### Releasing

```bash
npm version patch    # or minor / major — bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
gh release create vX.Y.Z --generate-notes
```

`release.yml` (triggered by the published GitHub release, not the tag push) re-runs the smoke check, verifies the tag matches `package.json`, and publishes to npm with provenance. The `NPM_TOKEN` secret must be minted from the personal `copperdesign` npm account (not the Manolab org).

## Architecture

### Two consent layers, one module

1. **Per-embed gate** — each `<div class="consent-embed" data-provider="…" data-embed="…">` is swapped for a real iframe only on click. The iframe URL never enters the document until then, so the third-party host is never contacted without explicit user action. This is the GDPR / "informierte Einwilligung" guarantee the module makes — a banner that loads embeds behind the scenes does not satisfy it.

2. **Optional global modal** — auto-shows until the visitor opts in to all providers at once. Non-blocking (semi-transparent backdrop). Suppressed page-by-page via a body attribute (default `data-cookie-consent-no-prompt`), or globally via `showModal: false` ("embed-only mode").

Both layers share the same provider registry, the same i18n strings, and the same storage. The imperative `controller.gate(container, { provider, onLoad })` API exposes the per-embed gate UI for cases where the post-consent action is richer than `<iframe src="…">` (e.g. booting the YouTube IFrame API for player callbacks).

### Storage model — two stores, two lifetimes

This split is load-bearing; preserve the distinction when changing storage code.

- **`localStorage`** — durable consent. The global opt-in (`<storagePrefix>global`) and per-provider "remember" ticks (`<storagePrefix><providerId>`). Survives tab close.
- **`sessionStorage`** — the "Not now" decline (`<storagePrefix>declined`). Tab-scoped; closing the tab starts the prompt cycle over. The dark-pattern equivalent — a durable decline that silently survives forever — is deliberately rejected.

The intentional asymmetry: **the only durable decision is "yes."** Dismissing the modal via Esc / X / backdrop writes nothing at all; only "Not now" writes the session flag; only "Allow all" writes the durable opt-in.

All storage access goes through try/catch wrappers (`storeRead` / `storeWrite` / `sessionRead` / `sessionWrite`) so private-mode Safari and disabled-storage browsers degrade to "no prior consent" — the safe direction. Don't bypass them.

### Deferred load hooks

`onConsent` (any callback) and `googleFonts` (URL or array) fire **once per controller instance**, when global consent first becomes true — modal opt-in click, `optInAll()`, or boot-time restore from `localStorage`. Per-provider remember-ticks never trigger them. The `consentEffectsFired` flag prevents double-fire across boot-restore + later `optInAll()`.

The catch documented in the README: a static `<link>` / `@import` to `fonts.googleapis.com` in the HTML or CSS already fired before the module ran. `googleFonts` only covers the JS-injected path; adopting it means removing the static reference too.

### Deep-merge for `providers` and `strings`

`mergeProviders` and `mergeStrings` deep-merge user-supplied entries with the built-ins, so callers can add a single language or a single new provider without re-declaring the whole table. `mergeOptions` shallow-merges everything else and routes those two through the deep mergers.

### Controller API

`easyCookieConsent(options)` returns a plain object — bind it to `window` if inline `onclick="consent.reset()"` revoke links are wanted. Surface methods: `show`, `optInAll`, `optIn(providerId)`, `optOutAll`, `reset`, `teardown`, `hasConsent(providerId?)`, `gate(container, { provider, onLoad })`. `teardown()` must remain idempotent (callable twice silently); SPA hosts depend on this.

### i18n resolution

Language is resolved at call time, not at init — a runtime change to `<html lang>` or `opts.language` is picked up by the next render. Order: `opts.language` → exact `<html lang>` → prefix match (`en-US` → `en`) → `opts.fallbackLanguage` → first key in `strings` (safety net).

Strings that wrap a value (`label`, `hint`, `remember`) are functions, not `{{placeholder}}` templates, so translators control word order and inflection.

## Repo conventions

### Single-file, zero-deps, no build — these are constraints, not preferences

- Don't split `index.js` into multiple files. The "one file" property is part of the value proposition (vendor it without npm).
- Don't add runtime or dev dependencies. Browser APIs only. If you need a helper, write it inline.
- Don't add a build step, bundler, or transpile pipeline. Source ships as-is.
- Don't add telemetry of any kind. The point of the module is to NOT contact third parties without consent — that includes itself.
- Preserve the top `/*! ... */` banner — it's the license notice that survives minification. CI checks for it.

### Comment style

Comment liberally and explain WHY: browser quirks, GDPR-interpretation choices, the reason a key isn't written, the asymmetry between durable opt-in and session-only decline. Don't narrate the obvious line below. The existing comments in `index.js` are the calibration target — match that register.

Long, descriptive names over short clever ones. `async`/`await` over callbacks or stray `.then()` chains.

### Commits and releases

This is one of Christian's owner-repos — commit straight to `main`. No feature branches, no PRs, no review ceremony. Mirror the commit-message style already in `git log` (short prefix, present-tense subject, body when it earns its place).

## Reference docs

- `README.md` — public-facing API, options, providers, embed-only mode, imperative gate, deferred loads, CSS hooks. The `@docs README.md` tags in `index.js` point here.
- `CONTRIBUTING.md` — what fits / what doesn't, PR workflow, testing checklist for external contributors.
- `example.html` — the manual test harness. Update it when adding a provider or a visible-behavior change.
