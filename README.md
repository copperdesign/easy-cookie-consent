# @copperdesign/easy-cookie-consent

[![npm version](https://img.shields.io/npm/v/@copperdesign/easy-cookie-consent.svg)](https://www.npmjs.com/package/@copperdesign/easy-cookie-consent)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@copperdesign/easy-cookie-consent)](https://bundlephobia.com/package/@copperdesign/easy-cookie-consent)
[![license](https://img.shields.io/npm/l/@copperdesign/easy-cookie-consent.svg)](./LICENSE)

Click-to-load consent gate for third-party embeds (YouTube, Vimeo, SoundCloud, Google Maps) plus an optional global consent modal and deferred-load hooks for Google Fonts and arbitrary callbacks. No framework. No build step. Multi-language. Single file.

The third-party iframe URL never enters the document until the visitor clicks — which is what the German "informierte Einwilligung" (and GDPR more broadly) actually requires, not a banner that loads the embed behind the scenes anyway. The same gate is extended via `onConsent` / `googleFonts` to the page-wide third-party resources (analytics, fonts, embedded forms, calendar feeds) that aren't iframes but still leak visitor data on load.

```html
<div class="consent-embed"
     data-provider="youtube"
     data-embed="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"></div>

<script type="module">
  import easyCookieConsent from '@copperdesign/easy-cookie-consent';
  easyCookieConsent({
    privacyHref: '/privacy.html',
  });
</script>
```

That's the whole quickstart. The embed renders as a styled "Load video" placeholder; click it and the iframe is built in place.

## What it does

- **Per-embed gate.** Each `<div class="consent-embed">` is swapped for an iframe only on user click. Until then, no request goes to the third-party host.
- **Optional global modal.** Auto-shows until the visitor explicitly opts in to all providers at once. Two-tier dismissal: Esc / X / backdrop writes nothing (the modal can return on the next nav — the visitor didn't commit to anything), while the explicit "Not now" button writes a `sessionStorage` flag so the modal stays out of the way for the rest of the visit. Both clear when the tab closes. The only choice that survives the tab is the explicit "allow all."
- **Per-provider remember.** Each gate has an opt-in "remember this provider" checkbox. Persisted in `localStorage`.
- **Deferred Google Fonts.** Pass one or more Google Fonts URLs and the plugin injects the `<link rel="stylesheet">` only after consent. Same for any other deferred work via the `onConsent` callback.
- **i18n built in.** English and German shipped; add any language by passing a `strings.<lang>` table.
- **Zero dependencies, ~6 KB minified, one file.** Drop in via npm or vendor [`index.js`](./index.js) directly.

## Install

```sh
npm install @copperdesign/easy-cookie-consent
```

Or vendor [`index.js`](./index.js) — single file, no dependencies, no build step.

## Markup contract

Each embed is one element on the page:

```html
<div class="consent-embed"
     data-provider="youtube"
     data-embed="https://www.youtube.com/embed/<ID>?rel=0"></div>
```

- `data-provider` — one of the built-in providers (`youtube`, `vimeo`, `soundcloud`, `gmaps`, `gsheets`, `gcal`), or any provider you've added via `options.providers`.
- `data-embed` — the iframe URL to load on click. Whatever you'd normally put in `<iframe src>`.
- `data-title` *(optional but recommended)* — becomes the iframe's `title` attribute, its accessible name (WCAG 4.1.2). Describe the specific content: `data-title="Interview with Jane Doe"`. Without it, the provider label (`YouTube`) is used as a generic fallback. [`adopt()`](#adopting-raw-embeds) carries a pasted iframe's existing `title` over automatically.

The gate handles the rest. The placeholder occupies the same vertical slot the iframe will take, so the page doesn't reflow on click.

## API

```js
import easyCookieConsent from '@copperdesign/easy-cookie-consent';

const consent = easyCookieConsent(options);
```

Returns a controller object:

| Method | What it does |
|---|---|
| `consent.show()` | Open the modal manually. Useful for a footer "consent settings" link or for re-prompting after the visitor closed it with Esc. |
| `consent.optInAll()` | Writes the global opt-in, swaps in every declarative placeholder currently on the page, and fires the `onLoad` of any pending [`gate()`](#imperative-gate-custom-render-after-consent) still showing its placeholder. Same as clicking the modal's primary button. |
| `consent.optOutAll()` | Clears the global opt-in and writes a tab-scoped `declined` flag to `sessionStorage`, so the modal stays out of the way for the rest of the visit but returns in a fresh tab. Same as the modal's "Not now" button. |
| `consent.reset()` | Wipes **all** consent state (global plus every per-provider key). Use for a "revoke consent" link on the privacy page. Iframes already loaded on the current page stay loaded — a reload re-gates them. |
| `consent.teardown()` | Removes injected styles and the modal node if open. Idempotent. Use in SPAs when the host element is being unmounted. |
| `consent.hasConsent()` | Returns `true` if the visitor has granted global consent (durably, in `localStorage`). Use to gate code outside the plugin without poking at the storage key directly. |
| `consent.gate(container, { provider, onLoad })` | Imperative consent gate. Mounts the same placeholder UI used by the iframe-swap flow into `container`, and on consent calls `onLoad(container)` instead of inserting an iframe. Use when the post-consent action is richer than dropping in `<iframe src="…">` — booting the YouTube IFrame API for autoplay/loop/state callbacks, mounting an embedded form's JS, kicking off a calendar widget. See [Imperative gate](#imperative-gate-custom-render-after-consent). |
| `consent.adopt(html)` | Rewrites raw third-party embed markup — a CMS-pasted `<iframe>`, `<embed>`, or `<object>` with no `consent-embed` class — into gated placeholders, and returns a `DocumentFragment` to insert. The third-party host is never contacted until consent. Use for **client-rendered** content (headless CMS, SPA, fetched HTML). See [Adopting raw embeds](#adopting-raw-embeds). |

## Options

| Option | Default | Description |
|---|---|---|
| `privacyHref` | `'#privacy'` | The privacy-policy URL shown in the modal body and each per-embed hint. When it's a real route (not a `#fragment`), the modal auto-suppresses while the visitor is on that page — see [Suppressing the modal](#suppressing-the-modal-on-a-single-page). |
| `language` | `null` | `null` = auto-detect from `<html lang>`. Pass an ISO code (`'en'`, `'de'`) to force. |
| `fallbackLanguage` | `'en'` | Used when neither `language` nor `<html lang>` resolves to a built-in language. |
| `showModal` | `true` | Whether the modal auto-shows on init. Set `false` to run the plugin in embed-only mode — per-embed gates still work, no global dialog is ever shown. See [Embed-only mode](#embed-only-mode-no-global-modal). |
| `noPromptAttribute` | `'data-cookie-consent-no-prompt'` | Body attribute that suppresses the modal on a single page even when `showModal: true`. Cheaper than maintaining a second init call. |
| `storagePrefix` | `'cookieConsent:'` | `localStorage` key prefix. Change to migrate from a legacy prefix without losing visitor consent. |
| `colors` | (off-black / off-white palette) | Object of color tokens. See below — pass any subset; missing keys keep their default. |
| `embedHeights` | `{ default: 300, soundcloud: 100, gmaps: 470 }` | Per-provider placeholder heights in px. Matching the iframe avoids reflow on click. Pass any subset; add `<provider>: <px>` for any new provider you register. |
| `fontStack` | `'"Helvetica Neue", Helvetica, Arial, sans-serif'` | CSS `font-family` applied to both surfaces. Override for a typographic match with your host page. |
| `onConsent` | `null` | Callback fired once when global consent becomes true — modal opt-in click, `optInAll()` call, or boot-time restoration of a prior opt-in. Use for analytics, embedded forms, calendar feeds, anything that would transmit visitor data on load. See [Deferred loads](#deferred-loads-onconsent--googlefonts). |
| `googleFonts` | `null` | A single Google Fonts stylesheet URL, or an array of URLs. After consent, the plugin injects each as `<link rel="stylesheet">` and a single preconnect to `fonts.gstatic.com`. See [Deferred loads](#deferred-loads-onconsent--googlefonts). |
| `providers` | (youtube, vimeo, soundcloud, gmaps, gsheets, gcal) | Map of provider definitions. Pass entries to add or override. See below. |
| `strings` | (`en`, `de`) | Map of localized strings. Pass entries to add or override. See below. |

### Color tokens

```js
easyCookieConsent({
  colors: {
    backdrop: 'rgba(20, 20, 20, 0.35)',  // semi-transparent backdrop
    surface:  '#ffffff',                  // modal card background
    text:     '#111111',                  // primary ink
    muted:    'rgba(17, 17, 17, 0.62)',
    border:   'rgba(17, 17, 17, 0.14)',
    accent:   '#111111',                  // primary button fill
    accentInk:'#ffffff',                  // primary button ink
    embedSurface: '#E1E4E6',              // per-embed placeholder background
  },
});
```

Any subset is fine — missing keys keep their default.

### Adding a provider

```js
easyCookieConsent({
  providers: {
    spotify: {
      label: 'Spotify',
      operator: 'Spotify AB, Sweden',
      iframeAttrs: {
        frameborder: '0',
        allow: 'autoplay; clipboard-write; encrypted-media',
        allowfullscreen: '',
      },
    },
  },
  embedHeights: {
    spotify: 152,
  },
  strings: {
    en: {
      placeholder: {
        actionLabel: { spotify: 'Load track' },
      },
    },
    de: {
      placeholder: {
        actionLabel: { spotify: 'Track laden' },
      },
    },
  },
});
```

Now `<div class="consent-embed" data-provider="spotify" data-embed="…">` works.

### Adding a language

```js
easyCookieConsent({
  strings: {
    fr: {
      modal: {
        title: 'Autoriser le contenu externe ?',
        body: 'Ce site intègre des vidéos, de l\'audio et des cartes de tiers. …',
        privacyLinkLabel: 'politique de confidentialité',
        optInLabel: 'Autoriser tout le contenu externe',
        optOutLabel: 'Pas maintenant',
        closeLabel: 'Fermer',
      },
      placeholder: {
        label: (p) => `Contenu externe de ${p}`,
        hint:  (op) => `Le chargement transfère des données à ${op}. Détails dans la `,
        hintAfter: '.',
        privacyLinkLabel: 'politique de confidentialité',
        remember: (p) => `Toujours charger ${p}`,
        actionLabel: {
          youtube: 'Charger la vidéo',
          vimeo: 'Charger la vidéo',
          soundcloud: 'Charger l\'audio',
          gmaps: 'Charger la carte',
        },
      },
    },
  },
});
```

Strings that wrap a value (`label`, `hint`, `remember`) are functions so translators control word order and inflection naturally — no `{{placeholder}}` mini-language.

The active language is resolved at call time, in this order:

1. `options.language` — explicit override.
2. `<html lang="…">` on the page — exact match first, then prefix (`"en-US"` → `"en"`).
3. `options.fallbackLanguage` — last resort.

## Deferred loads (`onConsent` + `googleFonts`)

The per-embed gate covers iframes. Plenty of third-party leakage isn't an iframe — Google Fonts CSS, an analytics snippet, a Wufoo form helper, a Google Calendar feed. The plugin exposes two hooks for those:

```js
easyCookieConsent({
  privacyHref: '/privacy.html',

  // Convenience: Google Fonts. Pass a URL or an array of URLs.
  googleFonts: 'https://fonts.googleapis.com/css?family=Inter:400,700&display=swap',

  // Generic: any deferred work. Fired once when global consent becomes true.
  onConsent: () => {
    inject('/assets/js/vendor/wufoo.min.js');
    inject('/assets/js/vendor/jquery.gcal_flow.min.js', initCalendar);
    enableAnalytics();
  },
});
```

Both hooks fire at the same trigger — the visitor opts in via the modal, `optInAll()` is called, or a prior opt-in is restored on boot — and both fire at most once per controller instance. Per-provider "remember this embed" ticks don't fire them; only an explicit global opt-in does.

### The catch: static `<link>` / `@import` still leaks

The plugin can only defer requests that go through *it*. A `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` in your HTML, or `@import url('https://fonts.googleapis.com/...');` in your CSS, fires on every pageview *before* any JS runs — the visitor's IP and User-Agent reach Google before the consent modal has rendered. The `googleFonts` option does nothing about that request because it has already happened.

Adopting `googleFonts` therefore means two changes:

1. **Remove** the static `<link>` / `@import` from your HTML and CSS.
2. **Add** the same URL to `googleFonts` so it loads via JS, only after consent.

Visitors who haven't yet opted in see the page in your CSS `font-family` fallback (the next family in the stack — Helvetica, system-ui, whatever). After opt-in, the Google Fonts stylesheet swaps in and the page repaints. If that fallback flash is unacceptable, self-host the fonts instead — the plugin can't square that circle for you.

### Checking consent from outside

If you need to gate code outside `onConsent` — say, a button that should be hidden until consent is granted — use the controller's `hasConsent()`:

```js
const consent = easyCookieConsent({ /* … */ });
if (consent.hasConsent()) {
  showAnalyticsToggle();
}
```

Don't read the underlying `localStorage` key directly. The storage prefix and key shape are an internal detail; `hasConsent()` is the supported surface.

## Imperative gate (custom render after consent)

The declarative `<div class="consent-embed" data-embed="…">` flow covers the most common case: drop in an iframe at the URL the visitor consented to. But sometimes the post-consent action isn't just inserting an iframe — it's booting a richer integration that the host page owns. The clearest example is the YouTube IFrame API: not "load this URL" but "instantiate a player I can call `playVideo()` / `pauseVideo()` / `setLoop(true)` on, and wire a state callback so the dialog auto-closes when the video ends." A static `<iframe src>` can't give you that.

For those cases, the controller exposes an imperative gate:

```js
const consent = easyCookieConsent({ /* … */ });

playButton.addEventListener("click", () => {
  videoDialog.showModal();
  consent.gate(playerContainer, {
    provider: "youtube",
    onLoad: (container) => {
      // The visitor has consented. Boot whatever the host page wants.
      loadYouTubeIframeApi().then(() => {
        new YT.Player(container, {
          videoId: "dQw4w9WgXcQ",
          events: {
            onReady: (e) => { e.target.setLoop(true); e.target.playVideo(); },
            onStateChange: (e) => { if (e.data === 0) videoDialog.close(); },
          },
        });
      });
    },
  });
});
```

What `gate()` handles:

- Renders the same placeholder UI the iframe-swap flow renders — same i18n strings, same "remember this provider" checkbox, same per-provider `localStorage` key.
- Recognizes prior consent. If the visitor has already opted in (per-provider or globally), `onLoad(container)` fires synchronously and no placeholder UI flashes.
- Reacts to a *later* global opt-in. While a gate is still showing its placeholder, a global opt-in — the modal's "Allow all", `optInAll()`, or a matching `optIn(provider)` — fires `onLoad(container)` automatically, exactly as it swaps in declarative iframes. The visitor doesn't have to click the gate's own button too. `onLoad` runs at most once per gate regardless of which path reaches it.
- Adds `.consent-embed`, `.consent-embed--<provider>`, and `.consent-embed--gated` to the container so the injected CSS applies. `--gated` drops the default fixed height because the host container owns sizing (a `<dialog>`, a flex slot, an aspect-ratio'd wrapper, etc.).
- Adds `.consent-embed--loaded` to the container before calling `onLoad`, so any custom CSS targeting the loaded state still applies.

What you handle:

- Constructing whatever DOM/state/players belong inside `container` once consent is granted. `gate()` clears the container right before calling `onLoad`, so you're free to write into it without worrying about leftover placeholder nodes.
- Sizing the container itself. The placeholder body fills the container's height; if the container has no defined height, the body collapses. Most callers already have an enclosing slot doing this (a `<dialog>`, a fixed-aspect-ratio wrapper).
- Re-rendering on subsequent opens. `gate()` is idempotent — call it again on the same container on the next button click and it'll go straight to `onLoad` because consent is now remembered.

The `provider` id you pass scopes the consent key. Built-in ids (`youtube`, `vimeo`, `gmaps`, …) share state with their declarative counterparts — a visitor who clicked "remember YouTube" on a `<div class="consent-embed" data-provider="youtube">` placeholder elsewhere on the site won't see the prompt again here. Custom ids (anything not in the provider registry) are accepted and get a minimal fallback label; useful when you want a private consent scope for a non-iframe integration.

## Adopting raw embeds

The markup contract assumes you (or your templates) wrap each embed in `<div class="consent-embed" …>`. But a CMS editor pasting a YouTube share snippet won't know that convention — they drop in a raw iframe:

```html
<iframe width="560" height="315" src="https://www.youtube.com/embed/Ky417-3HDKs" allowfullscreen></iframe>
```

`consent.adopt(html)` rewrites that — and any `<embed>` / `<object>` — into the same gated placeholder the declarative path produces, then hands back a `DocumentFragment` to insert:

```js
const consent = easyCookieConsent({ showModal: false });

// `html` is whatever the CMS field rendered to — a fetch response, an
// innerHTML string, a block of rich text.
container.replaceChildren(consent.adopt(html));
```

The provider is resolved from the URL's host, so a pasted `youtube.com/embed/…` gets the YouTube label, operator, and iframe attributes automatically — no `data-provider` needed. An unrecognized cross-origin host is gated under a generic "external content from `<host>`" placeholder, so nothing third-party slips through unlabelled. The embed's `width`/`height` become an `aspect-ratio` on the placeholder, so the box is reserved and the swap doesn't reflow.

**Insert the returned fragment — do not `innerHTML` it back to a string.** Serializing drops the placeholder's click handler, and for any embed the visitor already consented to it would write a live `src` back into the page.

### When this is a real guarantee — and when it isn't

`adopt()` parses the HTML in an inert document and only ever connects the gated placeholder, so the third-party `src` is never fetched. **That guarantee holds only for content you route through `adopt()` before it reaches the live page** — client-rendered content: a headless CMS payload, a fetch response, anything you assign via JS.

It does **not** retroactively protect an embed that was already baked into the HTML the server delivered. By the time any script runs, the browser's parser has already fetched that iframe's `src` — cookies set, host contacted. No client-side code can un-send that request. For server-rendered embeds the rewrite has to happen **upstream** — in the CMS, template, or a render-time filter — before the bytes leave the server. Reach for `adopt()` on the client only when the markup hasn't been parsed into the live document yet.

### Opting embeds out

- `data-consent-ignore` on a single element skips it (e.g. an embed you've already vetted).
- `ignoreHosts: ['js.stripe.com', 'cdn.example.com']` in options skips whole hosts (subdomains included) — for a cleared payment provider or your own CDN subdomain that's technically cross-origin.

Same-origin embeds and `data:` / `blob:` URLs are never gated — they contact no third party.

## Embed-only mode (no global modal)

If you don't want the global modal at all and prefer to rely entirely on the per-embed click-to-load gates, pass `showModal: false`:

```js
easyCookieConsent({ showModal: false });
```

That's it. Per-embed placeholders still render, the inline "remember this provider" checkbox still persists to `localStorage`, the `onConsent` callback still fires if the visitor flips to global consent later via `consent.optInAll()` — only the auto-shown dialog is suppressed. The controller still exposes `consent.show()` so you can surface the modal manually from a footer link or settings page if you ever want to.

This is the right config when:

- Your site's third-party surface is only embeds (videos, maps, donation widgets), so the per-embed gate already covers everything.
- You want to keep the consent UX out of the way until the visitor actually reaches an embed.
- You're rolling your own consent UI and just want the click-to-load machinery underneath.

### Suppressing the modal on a single page

The **privacy policy itself is handled automatically**: when `privacyHref` points to a real route (not a `#fragment`) and the visitor is on that page, the modal doesn't auto-show — surfacing a consent dialog over the policy the visitor came to read (the page the modal links to) is its own UX loop. Matched on origin + pathname; only the auto-show is suppressed, so an explicit `consent.show()` from a "consent settings" link on that page still opens it.

For any *other* page where you want the modal gone — an imprint, a checkout step — add the marker attribute to that page's `<body>`:

```html
<body data-cookie-consent-no-prompt>
```

The attribute name is configurable via `noPromptAttribute`. Per-embed gates still work; only the auto-shown modal is suppressed for that page.

## CSS hooks

| Class | When |
|---|---|
| `.consent-embed` | The placeholder slot. Always present. |
| `.consent-embed--<provider>` | Provider-specific. Use for per-provider sizing or styling. |
| `.consent-embed--loaded` | Added once the iframe has swapped in — or, for `gate()`, once the host page's `onLoad` has been called. Use to strip placeholder framing in custom themes. |
| `.consent-embed--gated` | Added by `gate()` to the host container. Drops the default fixed height so the placeholder fills whatever box the host gave it. |
| `.consent-modal__backdrop` / `.consent-modal__card` | The modal. Override in your own CSS for stronger restyling than `colors` allows. |

The injected `<style>` carries `data-easy-cookie-consent` — handy if you want to query it from a debug console or remove it manually.

## Revoke link

Bind the controller to `window` if you want an inline-HTML revoke link on your privacy page:

```js
window.consent = easyCookieConsent({ /* options */ });
```

```html
<a href="#" onclick="consent.reset(); return false;">Withdraw consent</a>
```

Or hook a regular event listener — the controller is just an object.

## Why this exists

The dominant pattern for "consent" on the modern web is a banner that closes once you click anything, while the YouTube and Google Maps requests already fired on page load. That's not consent — it's annoyance theater wrapped around the same data flow.

The pattern this module enforces:

1. **No third-party request until explicit consent.** The iframe URL is in `data-embed`, not `<iframe src>`. The DOM literally cannot ping YouTube before the click.
2. **The only durable decision is "yes."** The explicit "Not now" button writes a tab-scoped flag (so the modal doesn't pester the visitor for the rest of the visit) but nothing that survives the tab — a fresh visit prompts again. Closing the modal via Esc / X / backdrop is treated as no decision at all and writes nothing. No dark-pattern "I'll just dismiss this once and it's gone forever."
3. **Per-embed control is always available.** Even after declining, each embed has its own gate with its own opt-in. You can permit YouTube but not Google Maps without finding a settings panel.

It's also small. One file, no dependencies, no build step. Vendor it if you don't like npm.

## Contributing

PRs and issues welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the PR workflow, and what fits the scope. The repo follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

Quick version: fork, branch off `main`, exercise your change against `example.html` in at least one non-Chromium browser, open a PR. I (@copperdesign) review and merge.

## Releasing (maintainer notes)

The package is published to npm as
[`@copperdesign/easy-cookie-consent`](https://www.npmjs.com/package/@copperdesign/easy-cookie-consent).

For future releases:

```sh
npm version patch        # or minor / major — bumps package.json, commits, tags vX.Y.Z
git push --follow-tags
gh release create vX.Y.Z --generate-notes
```

The `release.yml` workflow handles the rest: smoke-checks the module, verifies the tag matches `package.json`, and publishes to npm with provenance. Requires an `NPM_TOKEN` repo secret minted from the `copperdesign` npm account.

## License

MIT — see [LICENSE](./LICENSE).

Created by [Christian Fillies](https://christianfillies.com).
