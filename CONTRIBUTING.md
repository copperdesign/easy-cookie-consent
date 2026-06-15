# Contributing

Thanks for the interest. This is a small, focused browser module — contributions
that make the consent gate sharper, less surprising, or more useful for the next
person dropping it into a static site are welcome.

## Ownership and merging

I (@copperdesign) maintain the repo and merge all PRs. You're welcome to
fork, branch, and propose changes — I'll review on my own timeline. No CLA.

## What fits

Yes:

- Bug fixes with a clear repro (a minimal HTML page that reproduces the
  glitch is the gold standard)
- New providers that are common in editorial sites (Twitter / X embeds,
  Instagram embeds, Spotify, Bandcamp). One provider per PR.
- Additional languages — open a PR with a new `strings.<lang>` entry.
  Include the modal text and the placeholder strings; if you don't know
  the action labels for every provider, leave the missing ones — the gate
  falls back to the provider's proper-noun label.
- Accessibility improvements: ARIA, focus management, keyboard nav,
  reduced-motion handling.
- Privacy-mode failure-handling improvements (private-mode Safari quirks,
  storage exceptions).
- Doc clarifications — especially the WHY of a behavior that confused you.

Probably no — open an issue first to discuss:

- New top-level options on the `options` object
- Adding runtime dependencies (the module is intentionally zero-deps; the
  contract is one file, browser APIs only)
- Restructuring `index.js` into multiple files
- Framework-specific wrappers (React, Vue, etc.) — these belong in
  separate packages that depend on this one
- Theming systems beyond the `colors` object

Hard no:

- Adding a build step, bundler, or transpile pipeline. The module ships
  as plain ES module source.
- Telemetry, analytics, "phone home" of any kind — the whole point of
  this module is to NOT contact third parties without consent.
- A "dark pattern" mode that auto-loads embeds after a timeout, scrolls,
  or any other implicit-consent flow. Out of scope, deliberately.
- Auto-generated boilerplate PRs (license bumps from bots, dependency
  pings against non-existent deps, mass formatting reflows).

## Getting set up

```bash
git clone https://github.com/copperdesign/easy-cookie-consent.git
cd easy-cookie-consent
```

No `npm install` — there are no dependencies, runtime or dev. Open
`example.html` directly through a static server to exercise the module
against real embeds.

```bash
# any static server will do — pick your favorite
python3 -m http.server 8000
# then visit http://localhost:8000/example.html
```

(File-protocol won't work — ES modules require `http(s)://`.)

## PR workflow

1. Fork and branch off `main`. Branch names are free-form.
2. Keep PRs scoped. One concern per PR; bundle small drive-by cleanups
   into the same diff if they're in the file you're touching, otherwise
   open a separate PR.
3. Write commit messages that explain *why*, not what. Mirror the style
   already in `git log` — short prefix, present-tense subject, body when
   it earns its place.
4. In the PR description: what changed, why, and how you tested. A short
   screen recording for anything visible (placeholder rendering, modal
   appearance, focus behavior) saves a lot of back-and-forth.
5. Open the PR against `main`.

## Code style

The module is a single plain ES module targeting evergreen browsers
(anything with `localStorage` and `replaceChildren` — i.e. 2020+).
No transpile, no bundle.

- **Zero runtime deps.** Browser APIs only. If you need a helper, write
  it inline.
- **One file.** `index.js` is the whole module. Don't split it up.
- **Comment liberally.** Inline comments explain WHY. Browser quirks,
  GDPR-interpretation choices, the reason a key isn't written — write
  the reasoning down. Don't narrate the obvious line below.
- **Long, descriptive names** over short clever ones.
- **`async`/`await` over callbacks or stray `.then()` chains.**
- **Idempotent teardown.** Calling the returned `teardown()` twice
  should be safe and silent.
- **Preserve the file header.** The top `/*! ... */` banner is the
  license notice that survives minification — leave it intact.

## Testing

There's no test suite — the module is exercised against `example.html`
and real sites. Before opening a PR:

1. Open `example.html` in a fresh browser (private window — fresh
   `localStorage`) and confirm: the modal shows on first visit; "Allow
   all" swaps in every embed; "Not now" closes without persisting; on
   reload, the modal shows again. Then "Allow all" again, reload — modal
   should NOT show, embeds load directly.
2. Spot-check the per-embed gate's "remember" checkbox: tick it, allow
   the embed, reload — the gate should not appear again for that
   provider.
3. Test in at least one non-Chromium browser (Safari or Firefox). Mobile
   Safari catches the most private-mode `localStorage` edge cases — if
   you can, spot-check it.
4. Confirm `teardown()` actually removes the injected styles — query
   `document.querySelector('[data-easy-cookie-consent]')` before and
   after; it should be gone after teardown.

Note what you tested in the PR description, including browser + OS.

## Reporting bugs

Open an issue with:

- A minimal HTML page that reproduces it (a Gist or CodePen is fine)
- The browser + OS where it reproduces
- What you expected vs. what happened
- The version (from `package.json` or your `npm ls` output)
- Whether you're testing in a private window (storage behavior differs)

A short screen recording is worth a thousand words for anything visual.

## Asking questions

Issues are fine for questions too — tag them `question`. Don't email me
directly with usage questions; an issue helps the next person.
