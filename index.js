/*! easy-cookie-consent — v0.5.1 - 2026-06-24
 * https://copperdesign.github.io/
 *
 * Copyright (c) 2026 Christian Fillies;
 * Licensed under the MIT license */

/**
 * Click-to-load consent gate for third-party embeds, plus an optional
 * one-time global consent modal. Zero dependencies, single file, ESM.
 *
 * Two layers of consent live in this module:
 *
 *   1. Per-embed gate. Each placeholder div is swapped for the real
 *      iframe only on user click. The iframe URL never enters the
 *      document until that click — and so never hits the third-party
 *      host — which is what the German "informierte Einwilligung"
 *      (and Article 6/7 GDPR more broadly) actually requires. The
 *      visitor can persist a per-provider choice via the inline
 *      "remember" checkbox.
 *
 *   2. Global modal. An optional editorial dialog that offers one
 *      place to opt in to all providers at once. Dismissing it via
 *      Esc, the X, or the backdrop writes nothing — the visitor
 *      hasn't committed to anything, so the modal can return on the
 *      next navigation. The explicit "Not now" button is the real
 *      decline: it writes a tab-scoped flag to sessionStorage so the
 *      modal stays out of the way for the rest of the visit, but a
 *      fresh tab or a return after the tab is closed will show it
 *      again. Only an explicit global opt-in is durable across
 *      visits. Per-embed gates remain available regardless. The
 *      modal is non-blocking — floats over content with a
 *      semi-transparent backdrop.
 *
 * @docs README.md
 */

// ---------------------------------------------------------------------------
// Built-in defaults
//
// Everything here can be overridden through the options argument. Strings
// and providers deep-merge with built-ins so callers can add a language or
// a new provider without re-declaring the whole table.
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS = {
  // localStorage key prefix. Entries are written as
  // `<storagePrefix><name>` — e.g. "cookieConsent:global",
  // "cookieConsent:youtube". Change this if you have a legacy prefix to
  // preserve, or to avoid collisions in a shared origin.
  storagePrefix: "cookieConsent:",

  // The privacy-policy URL surfaced inside the modal body and per-embed
  // placeholders. Use whatever route your site has. Hash-only is fine for
  // demos. When it points to a real route (not a "#fragment"), the modal
  // auto-suppresses on that page so its backdrop never covers the policy
  // the visitor came to read — see onPrivacyPage().
  privacyHref: "#privacy",

  // null  → auto-detect from <html lang>; fall back to `fallbackLanguage`.
  // "de"  → force German regardless of page lang.
  language: null,
  fallbackLanguage: "en",

  // The modal auto-shows on every page until the visitor opts in
  // globally. Set `false` to suppress it for this init call — useful
  // for embed-free meta pages (imprint, privacy policy itself) where
  // the dialog is pure noise.
  showModal: true,

  // Body attribute that suppresses the modal on a specific page even
  // when `showModal: true` is set. Cheaper than passing different
  // options per page.
  noPromptAttribute: "data-cookie-consent-no-prompt",

  // Palette. Two surfaces — the modal sits on white, the per-embed
  // placeholder sits on a muted neutral so it reads as "intentional
  // empty space" rather than "broken embed". Override the whole block
  // when embedding into a site with a stronger identity.
  colors: {
    backdrop: "rgba(20, 20, 20, 0.35)",
    surface: "#ffffff",       // modal card background
    text: "#111111",          // primary ink (modal + embed)
    muted: "rgba(17, 17, 17, 0.62)",
    border: "rgba(17, 17, 17, 0.14)",
    accent: "#111111",        // modal primary-button fill
    accentInk: "#ffffff",     // ink on the primary-button fill
    embedSurface: "#E1E4E6",  // per-embed placeholder background
  },

  fontStack: '"Helvetica Neue", Helvetica, Arial, sans-serif',

  // Generic deferred-load callback. Fires at most once per controller
  // instance, the moment global consent becomes true — either when the
  // visitor clicks the modal's primary opt-in button, when optInAll() is
  // called via the API, or synchronously at boot if a prior opt-in is
  // restored from localStorage. Use this hook for analytics, embedded
  // forms, calendar feeds — anything that would transmit visitor data on
  // load and needs to wait for explicit consent.
  //
  // Per-provider remember-ticks do NOT trigger this — they only authorize
  // the one embed the visitor clicked. onConsent is reserved for the
  // global "yes to all" event.
  onConsent: null,

  // Convenience: deferred Google Fonts loader. Pass one URL or an array.
  // The plugin injects each `<link rel="stylesheet">` (plus a single
  // preconnect to fonts.gstatic.com) after consent, idempotently.
  //
  //   googleFonts: 'https://fonts.googleapis.com/css?family=Inter:400,700'
  //   googleFonts: [
  //     'https://fonts.googleapis.com/css?family=EB+Garamond',
  //     'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
  //   ]
  //
  // IMPORTANT: this only handles the POST-consent load. If your CSS still
  // has `@import url('https://fonts.googleapis.com/...')` or your HTML
  // still has `<link rel="stylesheet" href="...fonts.googleapis.com...">`,
  // the request fires on every pageview BEFORE this module runs — the
  // visitor's IP leaks to Google before any consent gate has rendered.
  // Remove those static references when adopting this option, and accept
  // an unstyled-fallback flash for visitors who haven't yet opted in.
  googleFonts: null,

  // Default heights for the per-embed placeholder, in px. Match the
  // iframe dimensions the embed will take on click so the page doesn't
  // reflow. Per-provider overrides: add `<provider>: <px>` here, or
  // style `.consent-embed--<provider>` from your own CSS.
  embedHeights: {
    default: 300,      // YouTube-class video
    soundcloud: 100,   // SoundCloud's short player strip
    gmaps: 470,        // full-bleed map band
    gsheets: 500,      // published Google Sheet (table-of-content height)
    gcal: 600,         // Google Calendar's default embed height
    betterplace: 320,  // donation widget
    gooding: 250,      // banner widget
    jotform: 800,      // form embeds are typically tall
  },

  // Provider registry. Proper-noun fields (`label`, `operator`) are
  // language-neutral. Localized action labels live under `strings.*.placeholder.actionLabel`.
  // Add a new provider by passing it under `options.providers` — it'll merge
  // with the defaults.
  providers: {
    youtube: {
      label: "YouTube",
      operator: "Google LLC, USA",
      // `hosts` powers adopt() — the URL→provider resolver matches a raw
      // pasted iframe's src host against these so the gate gets the right
      // label/operator without a hand-authored data-provider. Bare entries
      // match the host (subdomain-tolerant); entries with a "/" match a
      // host+path prefix, which is how the three Google products that share
      // google.com get told apart (see gmaps/gsheets below).
      hosts: ["youtube.com", "youtube-nocookie.com", "youtu.be"],
      iframeAttrs: {
        frameborder: "0",
        allow: "autoplay; encrypted-media",
        allowfullscreen: "",
      },
    },
    vimeo: {
      label: "Vimeo",
      operator: "Vimeo, Inc., USA",
      hosts: ["vimeo.com"],
      iframeAttrs: {
        frameborder: "0",
        allow: "autoplay; fullscreen; picture-in-picture",
        allowfullscreen: "",
      },
    },
    soundcloud: {
      label: "SoundCloud",
      operator: "SoundCloud Global Ltd. & Co. KG, Berlin",
      hosts: ["soundcloud.com"],
      iframeAttrs: {
        frameborder: "no",
        scrolling: "no",
        allow: "autoplay",
      },
    },
    gmaps: {
      label: "Google Maps",
      operator: "Google LLC, USA",
      // google.com/maps shares the host with Sheets/Calendar/Search, so the
      // path prefix is load-bearing here. maps.app.goo.gl is the share-link
      // host; maps.google.com the legacy one.
      hosts: ["google.com/maps", "maps.google.com", "maps.app.goo.gl"],
      iframeAttrs: {
        frameborder: "0",
        allowfullscreen: "",
        style: "border:0",
      },
    },
    gsheets: {
      label: "Google Sheets",
      operator: "Google LLC, USA",
      hosts: ["docs.google.com/spreadsheets"],
      iframeAttrs: {
        frameborder: "0",
        // Sheets' published-to-the-web iframe ships its own scrollbars; let
        // them through rather than constraining at the wrapper level.
        scrolling: "auto",
      },
    },
    gcal: {
      label: "Google Calendar",
      operator: "Google LLC, USA",
      hosts: ["calendar.google.com"],
      iframeAttrs: {
        frameborder: "0",
        scrolling: "no",
        style: "border:0",
      },
    },
    betterplace: {
      label: "betterplace.org",
      operator: "gut.org gAG, Berlin",
      hosts: ["betterplace.org"],
      iframeAttrs: {
        frameborder: "0",
        marginheight: "0",
        marginwidth: "0",
        style: "border:0; background:#fff",
      },
    },
    gooding: {
      label: "Gooding",
      operator: "Gooding GmbH, Hamburg",
      iframeAttrs: {
        frameborder: "0",
        scrolling: "yes",
        allowtransparency: "true",
      },
    },
    jotform: {
      label: "Jotform",
      operator: "Jotform Inc., USA",
      iframeAttrs: {
        frameborder: "0",
        scrolling: "no",
        allowfullscreen: "",
      },
    },
  },

  // Per-language copy. Functions are used where text wraps a value
  // (provider name, operator) so translators control word order and
  // inflection naturally — no `{{placeholder}}` mini-language. Add a
  // language by passing a new top-level key in options.strings.
  strings: {
    en: {
      modal: {
        title: "Allow external content?",
        body:
          "This site loads external content from third-party providers. " +
          "Loading it connects your browser to those providers. You can consent " +
          "once for all of them here, or decide individually per embed. " +
          "Details in the ",
        privacyLinkLabel: "privacy policy",
        optInLabel: "Allow all external content",
        optOutLabel: "Not now",
        closeLabel: "Close",
      },
      placeholder: {
        label: (p) => `External content from ${p}`,
        hint: (op) => `Loading connects your browser to ${op}. Details in the `,
        hintAfter: ".",
        privacyLinkLabel: "privacy policy",
        remember: (p) => `Always load ${p} in the future`,
        actionLabel: {
          youtube: "Load video",
          vimeo: "Load video",
          soundcloud: "Load audio",
          gmaps: "Load map",
          gsheets: "Load spreadsheet",
          gcal: "Load calendar",
          betterplace: "Load donation form",
          gooding: "Load donation widget",
          jotform: "Load form",
        },
      },
    },
    de: {
      modal: {
        title: "Externe Inhalte erlauben?",
        body:
          "Diese Seite lädt externe Inhalte von Drittanbietern. Beim " +
          "Laden wird eine Verbindung zu diesen Anbietern hergestellt. Du kannst hier " +
          "allem auf einmal zustimmen — oder einzeln pro Embed " +
          "entscheiden. Mehr dazu in der ",
        privacyLinkLabel: "Datenschutzerklärung",
        optInLabel: "Alle externen Inhalte zulassen",
        optOutLabel: "Nicht jetzt",
        closeLabel: "Schließen",
      },
      placeholder: {
        label: (p) => `Externer Inhalt von ${p}`,
        hint: (op) => `Beim Laden wird eine Verbindung zu ${op} hergestellt. Mehr dazu in der `,
        hintAfter: ".",
        privacyLinkLabel: "Datenschutzerklärung",
        remember: (p) => `${p} künftig automatisch laden`,
        actionLabel: {
          youtube: "Video laden",
          vimeo: "Video laden",
          soundcloud: "Audio laden",
          gmaps: "Karte laden",
          gsheets: "Tabelle laden",
          gcal: "Kalender laden",
          betterplace: "Spendenformular laden",
          gooding: "Spenden-Widget laden",
          jotform: "Formular laden",
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Storage state model
//
// Two stores, two lifetimes:
//
//   • localStorage holds durable consent — the global opt-in and any
//     per-provider "remember" ticks. These survive tab close, browser
//     restart, and returning to the domain days later.
//
//   • sessionStorage holds the "not now" decline. It's scoped to the
//     current top-level browsing context, so navigating between pages
//     on the same site keeps the modal out of the way, but closing the
//     tab (or opening the site in a fresh tab) starts the prompt cycle
//     over. This matches what the visitor likely means by "leaving the
//     site" — without us having to guess at navigation targets.
//
// Per-embed gates always remain available regardless of the global
// decision, so a session-decliner can still load individual embeds.
// ---------------------------------------------------------------------------
const KEY_GLOBAL = "global";
const KEY_DECLINED = "declined";

// ---------------------------------------------------------------------------
// Public entry point
//
// One call, returns the controller. Calling it twice on the same page
// silently no-ops the second call — the first controller still wins.
// ---------------------------------------------------------------------------

/**
 * Initialize the consent gate.
 *
 * @param {Object} [userOptions]  See README → "Options".
 * @returns {{
 *   show: Function,
 *   optInAll: Function,
 *   optIn: (providerId: string) => void,
 *   optOutAll: Function,
 *   reset: Function,
 *   teardown: Function,
 *   hasConsent: (providerId?: string) => boolean,
 *   gate: (container: Element, opts: { provider: string, onLoad: (container: Element) => void }) => void,
 *   adopt: (html: string) => DocumentFragment,
 * }} Controller API. Bind to `window` if you want inline
 *    `onclick="…"` revoke links (see README → "Revoke link").
 *
 * @docs README.md#api
 */
export default function easyCookieConsent(userOptions = {}) {
  const opts = mergeOptions(DEFAULT_OPTIONS, userOptions);

  // Track everything that needs cleanup so teardown() can fully undo.
  let stylesEl = null;
  let modalEl = null;
  let modalKeyHandler = null;
  let modalLastFocused = null;

  // onConsent + googleFonts are fire-once-per-instance. Tracked here so a
  // restored-on-boot consent followed by an explicit optInAll() doesn't
  // double-fire — and so a per-provider remember-tick never accidentally
  // triggers global side effects. teardown() doesn't reset this; a host
  // page that wants the effects to fire again after teardown should
  // re-initialize the controller.
  let consentEffectsFired = false;

  // Imperative gate()s still showing a placeholder. The declarative
  // iframe-swap path is re-scanned straight from the DOM by processEmbeds(),
  // but a gate()'d container carries no data-embed for that scan to find —
  // its load action lives in a host-supplied onLoad closure. We hold those
  // closures here so a later global opt-in (modal "Allow all", optInAll(),
  // or a matching optIn(provider)) fires them too. Without this, a gate()'d
  // embed would sit as a placeholder even after the visitor consented to
  // everything, and only its own button would load it.
  const pendingGates = [];

  // --- Storage (private-mode-safe; failures degrade to "no prior consent",
  // which is the safe direction.)
  const fullKey = (k) => opts.storagePrefix + k;
  function storeRead(k) {
    try { return localStorage.getItem(fullKey(k)); } catch { return null; }
  }
  function storeWrite(k, v) {
    try { localStorage.setItem(fullKey(k), v); } catch { /* private mode */ }
  }
  function storeClear(k) {
    try { localStorage.removeItem(fullKey(k)); } catch { /* ignore */ }
  }

  // Session-scoped twin of the above — used only for the "not now"
  // decline so it evaporates when the tab closes.
  function sessionRead(k) {
    try { return sessionStorage.getItem(fullKey(k)); } catch { return null; }
  }
  function sessionWrite(k, v) {
    try { sessionStorage.setItem(fullKey(k), v); } catch { /* private mode */ }
  }
  function sessionClear(k) {
    try { sessionStorage.removeItem(fullKey(k)); } catch { /* ignore */ }
  }

  function hasGlobalConsent() { return storeRead(KEY_GLOBAL) === "1"; }
  function hasDeclinedThisSession() { return sessionRead(KEY_DECLINED) === "1"; }

  // Are we currently *on* the privacy page that the modal links to? If so,
  // the auto-show is suppressed (see boot) — the modal's whole point on
  // this page would be to send the visitor here to read the policy, and a
  // backdrop sitting over that policy defeats it. Matched on origin +
  // pathname (trailing slash normalized); a pure-fragment privacyHref
  // ("#privacy") denotes a section of the current page, not a dedicated
  // route, so it never counts — use noPromptAttribute for that case.
  // Only the auto-show is gated; an explicit consent.show() still works
  // here, so a "consent settings" link on the privacy page is unaffected.
  function onPrivacyPage() {
    const href = opts.privacyHref;
    if (!href || href.charAt(0) === "#") return false;
    let target;
    try { target = new URL(href, location.href); } catch { return false; }
    if (target.host !== location.host) return false;
    const norm = (p) => p.replace(/\/+$/, "") || "/";
    return norm(target.pathname) === norm(location.pathname);
  }
  function hasConsent(providerId) {
    if (hasGlobalConsent()) return true;
    return storeRead(providerId) === "1";
  }

  // --- Language. Resolved at call time so a runtime change to
  // <html lang> or opts.language is picked up by the next render.
  function resolveLang() {
    const strings = opts.strings;
    if (opts.language && strings[opts.language]) return opts.language;
    const htmlLang = (document.documentElement.lang || "").trim();
    if (htmlLang) {
      if (strings[htmlLang]) return htmlLang;
      const prefix = htmlLang.split("-")[0];
      if (strings[prefix]) return prefix;
    }
    if (strings[opts.fallbackLanguage]) return opts.fallbackLanguage;
    // Last-resort safety net: first key in strings. Should never trigger
    // if fallbackLanguage is set correctly, but keeps the module from
    // crashing when a caller removes the fallback language entirely.
    return Object.keys(strings)[0];
  }
  function t() { return opts.strings[resolveLang()]; }

  // --- Per-embed placeholder body. Minimal DOM on purpose: one labelled
  // block, one button, one optional "remember" checkbox. No fake play button,
  // no remote-fetched thumbnail (that would itself be a third-party request,
  // defeating the point of the gate).
  //
  // Returns the body element. Callers decide where to mount it and what
  // happens after the visitor clicks "load" — the iframe-swap flow uses this
  // to drop in an iframe; the imperative `gate()` API uses it to hand control
  // back to the host page so it can boot a richer integration (YouTube
  // IFrame API, embedded form, calendar feed) instead of a static iframe.
  function buildPlaceholderBody(providerId, provider, onConfirm) {
    const s = t().placeholder;
    const body = document.createElement("div");
    body.className = "consent-embed__body";

    const label = document.createElement("p");
    label.className = "consent-embed__label";
    label.textContent = s.label(provider.label);

    const hint = document.createElement("p");
    hint.className = "consent-embed__hint";
    hint.append(s.hint(provider.operator));
    const link = document.createElement("a");
    link.href = opts.privacyHref;
    link.textContent = s.privacyLinkLabel;
    hint.append(link, s.hintAfter);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "consent-embed__button";
    button.textContent = s.actionLabel[providerId] || provider.label;

    const remember = document.createElement("label");
    remember.className = "consent-embed__remember";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    remember.append(checkbox, " " + s.remember(provider.label));

    body.append(label, hint, button, remember);

    button.addEventListener("click", () => {
      if (checkbox.checked) storeWrite(providerId, "1");
      onConfirm();
    });
    return body;
  }

  function renderPlaceholder(node, providerId, provider) {
    const body = buildPlaceholderBody(providerId, provider, () => swapInIframe(node, provider));
    node.replaceChildren(body);
  }

  // --- Swap the placeholder for the real iframe. The iframe is built
  // fresh (the URL has never been in the DOM until now), so we apply the
  // provider's standard attribute set explicitly.
  function swapInIframe(node, provider) {
    const iframe = document.createElement("iframe");
    iframe.src = node.dataset.embed;
    iframe.width = "100%";
    iframe.height = "100%";
    for (const [name, value] of Object.entries(provider.iframeAttrs || {})) {
      iframe.setAttribute(name, value);
    }
    // WCAG 4.1.2: an iframe needs an accessible name, and `title` is the
    // canonical way to give it one (technique H64). Authors describe the
    // specific embed via data-title; the provider label ("YouTube") is the
    // fallback — generic, but an honest name beats no name. Set after the
    // iframeAttrs loop so the per-embed value always wins.
    iframe.title = node.dataset.title || provider.label;
    node.replaceChildren(iframe);
    node.classList.add("consent-embed--loaded");
  }

  function processEmbeds(root = document) {
    const nodes = root.querySelectorAll(".consent-embed[data-provider][data-embed]");
    for (const node of nodes) {
      const providerId = node.dataset.provider;
      const provider = opts.providers[providerId];
      if (!provider) continue; // unknown provider — leave the node alone so it's visible in dev
      // Match the modifier class the imperative gate() path applies, so
      // per-provider CSS (the injected `embedHeights` rule, the gmaps
      // border-radius reset, any host overrides) targets declarative
      // nodes too. Authors can pre-set it in markup; classList.add is a
      // no-op when it's already there.
      node.classList.add("consent-embed--" + providerId);
      if (hasConsent(providerId)) {
        swapInIframe(node, provider);
      } else {
        renderPlaceholder(node, providerId, provider);
      }
    }
  }

  // --- Resolve a raw embed URL to a registered provider id, or null.
  // Matches against each provider's `hosts`: a bare entry ("youtube.com")
  // matches the host and any subdomain; an entry with a slash
  // ("google.com/maps") matches a host+path prefix, which is the only way
  // to tell the Google products that share google.com apart. `www.` is
  // stripped both sides so it never has to be spelled out in the registry.
  function providerForUrl(url) {
    let u;
    try { u = new URL(url, location.href); } catch { return null; }
    const host = u.host.replace(/^www\./, "");
    const hostPath = host + u.pathname;
    for (const [id, provider] of Object.entries(opts.providers)) {
      for (const pattern of provider.hosts || []) {
        if (pattern.includes("/")) {
          if (hostPath.startsWith(pattern.replace(/^www\./, ""))) return id;
        } else if (host === pattern || host.endsWith("." + pattern)) {
          return id;
        }
      }
    }
    return null;
  }

  // --- Register (once) a synthetic provider for an unrecognized host so
  // adopt() can still gate it. The host stands in for both label and
  // operator: the placeholder reads "external content from <host>" /
  // "connects your browser to <host>" — honest about what little we know.
  // The per-host id means a "remember" tick scopes to that host alone,
  // same as any first-class provider. iframeAttrs is deliberately empty:
  // we don't know what the embed needs, so we add nothing.
  function ensureExternalProvider(host) {
    const clean = host.replace(/^www\./, "");
    const id = "external-" + clean.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    if (!opts.providers[id]) {
      opts.providers[id] = { label: clean, operator: clean, iframeAttrs: {} };
    }
    return id;
  }

  // --- Styles. Injected once. Scoped under .consent-embed* and
  // .consent-modal*. Both prefixes are namespaced enough to avoid
  // collisions in host pages.
  function injectStyles() {
    if (stylesEl) return;
    const c = opts.colors;
    const h = opts.embedHeights;
    stylesEl = document.createElement("style");
    stylesEl.setAttribute("data-easy-cookie-consent", "");
    // Tight tracking + generous padding + editorial register. Animation
    // under 200ms, ease-out, fade only — no springs, no bounces. Backdrop
    // is semi-transparent rather than opaque: the modal floats over
    // content, it doesn't wall it off.
    stylesEl.textContent = `
      /* --- per-embed placeholder -------------------------------------- */
      .consent-embed {
        display: block; width: 100%;
        background: ${c.embedSurface}; color: ${c.text};
        font-family: ${opts.fontStack};
        height: ${h.default}px;
      }
      ${perProviderHeights(h)}
      .consent-embed__body {
        height: 100%;
        display: flex; flex-direction: column;
        justify-content: center; align-items: flex-start;
        gap: 0.75rem;
        padding: 1.5rem 2rem;
        box-sizing: border-box;
      }
      .consent-embed__label {
        margin: 0;
        font-size: 0.85rem; font-weight: 600;
        letter-spacing: 0.04em; text-transform: uppercase;
      }
      .consent-embed__hint {
        margin: 0;
        font-size: 0.9rem; line-height: 1.45;
        max-width: 42em;
        opacity: 0.75;
      }
      .consent-embed__hint a { color: inherit; text-decoration: underline; }
      .consent-embed__button {
        appearance: none;
        border: 1px solid ${c.text}; background: transparent; color: ${c.text};
        font: inherit; font-size: 0.9rem;
        padding: 0.55rem 1.25rem;
        border-radius: 999px;
        cursor: pointer;
        transition: background-color 150ms ease-out, color 150ms ease-out;
        letter-spacing: 0.01em;
      }
      .consent-embed__button:hover,
      .consent-embed__button:focus-visible {
        background: ${c.text}; color: ${c.embedSurface};
      }
      .consent-embed__remember {
        display: inline-flex; align-items: center; gap: 0.5rem;
        font-size: 0.8rem; opacity: 0.7; cursor: pointer;
      }
      .consent-embed__remember input { margin: 0; }
      /* SoundCloud's short slot collapses to a single row so the load
         button stays inline with the label. */
      .consent-embed--soundcloud .consent-embed__body {
        flex-direction: row; flex-wrap: wrap; align-items: center;
        gap: 1rem; padding: 1rem 1.5rem;
      }
      .consent-embed--soundcloud .consent-embed__hint {
        flex-basis: 100%; order: 3; font-size: 0.8rem;
      }
      /* Once loaded, the wrapper just holds the iframe (or host-supplied
         content from gate()) — strip its framing so the payload fills the
         slot edge-to-edge. */
      .consent-embed--loaded { background: transparent; padding: 0; }
      .consent-embed--loaded iframe {
        display: block; width: 100%; height: 100%; border: 0;
      }
      .consent-embed--loaded.consent-embed--gmaps iframe { border-radius: 0; }
      /* gate(): the host container owns sizing — drop the default fixed
         height so the placeholder fills whatever box the host gave us
         (a <dialog>, a flex slot, an aspect-ratio'd wrapper, …). */
      .consent-embed--gated { height: 100%; }

      /* --- modal ------------------------------------------------------ */
      .consent-modal__backdrop {
        position: fixed; inset: 0; z-index: 9999;
        background: ${c.backdrop};
        display: flex; align-items: center; justify-content: center;
        padding: 1.5rem;
        font-family: ${opts.fontStack};
        animation: consent-modal-fade 150ms ease-out;
      }
      @keyframes consent-modal-fade {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .consent-modal__card {
        position: relative;
        background: ${c.surface};
        color: ${c.text};
        max-width: 440px; width: 100%;
        padding: 2.25rem 2rem 1.75rem;
        box-sizing: border-box;
        box-shadow: 0 12px 40px rgba(0,0,0,0.18);
        border: 1px solid ${c.border};
        border-radius: 28px;
      }
      .consent-modal__close {
        position: absolute; top: 0.5rem; right: 0.5rem;
        appearance: none; background: transparent; border: 0;
        width: 2.25rem; height: 2.25rem;
        border-radius: 50%;
        font: inherit; font-size: 1.25rem; line-height: 1;
        color: ${c.muted}; cursor: pointer;
        transition: color 150ms ease-out, background-color 150ms ease-out;
      }
      .consent-modal__close:hover,
      .consent-modal__close:focus-visible {
        color: ${c.text}; background: ${c.border}; outline: none;
      }
      .consent-modal__title {
        margin: 0 0 0.85rem;
        font-size: 1rem; font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      .consent-modal__body {
        margin: 0 0 1.5rem;
        font-size: 0.92rem; line-height: 1.5;
        color: ${c.muted};
      }
      .consent-modal__body a {
        color: inherit; text-decoration: underline;
      }
      .consent-modal__actions {
        display: flex; flex-direction: column; gap: 0.5rem;
      }
      .consent-modal__btn {
        appearance: none; font: inherit; font-size: 0.9rem;
        padding: 0.7rem 1.5rem; cursor: pointer;
        border-radius: 999px;
        transition: background-color 150ms ease-out, color 150ms ease-out;
        letter-spacing: 0.01em;
      }
      .consent-modal__btn--primary {
        background: ${c.accent}; color: ${c.accentInk};
        border: 1px solid ${c.accent};
      }
      .consent-modal__btn--primary:hover,
      .consent-modal__btn--primary:focus-visible {
        background: transparent; color: ${c.accent}; outline: none;
      }
      .consent-modal__btn--secondary {
        background: transparent; color: ${c.text};
        border: 1px solid ${c.border};
      }
      .consent-modal__btn--secondary:hover,
      .consent-modal__btn--secondary:focus-visible {
        border-color: ${c.text}; outline: none;
      }
    `;
    document.head.appendChild(stylesEl);
  }

  // --- Modal. Built fresh each show; torn down on close. No internal
  // state survives a dismiss except the localStorage key (only set by
  // the primary opt-in button).
  function showModal() {
    if (modalEl) return; // already showing — don't stack
    injectStyles();
    const m = t().modal;

    const backdrop = document.createElement("div");
    backdrop.className = "consent-modal__backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "consent-modal__title");

    const card = document.createElement("div");
    card.className = "consent-modal__card";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "consent-modal__close";
    closeBtn.setAttribute("aria-label", m.closeLabel);
    closeBtn.textContent = "✕";

    const title = document.createElement("h2");
    title.id = "consent-modal__title";
    title.className = "consent-modal__title";
    title.textContent = m.title;

    const body = document.createElement("p");
    body.className = "consent-modal__body";
    body.append(m.body);
    const link = document.createElement("a");
    link.href = opts.privacyHref;
    link.textContent = m.privacyLinkLabel;
    body.append(link, ".");

    const actions = document.createElement("div");
    actions.className = "consent-modal__actions";

    const optIn = document.createElement("button");
    optIn.type = "button";
    optIn.className = "consent-modal__btn consent-modal__btn--primary";
    optIn.textContent = m.optInLabel;

    const optOut = document.createElement("button");
    optOut.type = "button";
    optOut.className = "consent-modal__btn consent-modal__btn--secondary";
    optOut.textContent = m.optOutLabel;

    actions.append(optIn, optOut);
    card.append(closeBtn, title, body, actions);
    backdrop.append(card);
    document.body.append(backdrop);

    modalEl = backdrop;
    modalLastFocused = document.activeElement;
    optIn.focus();

    // Two-tier dismissal:
    //   • Esc / X / backdrop just close the modal — the visitor isn't
    //     committing to anything, just hiding the dialog. Nothing is
    //     written, so the modal can return on the next navigation.
    //   • The explicit "Not now" button is a real decision — it writes
    //     the session decline so the modal stays out of the way for the
    //     rest of the visit.
    // Only the primary opt-in button writes the durable global consent.
    modalKeyHandler = (e) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", modalKeyHandler);

    closeBtn.addEventListener("click", closeModal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
    optIn.addEventListener("click", () => { optInAll(); closeModal(); });
    optOut.addEventListener("click", () => { optOutAll(); closeModal(); });
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    if (modalKeyHandler) {
      document.removeEventListener("keydown", modalKeyHandler);
      modalKeyHandler = null;
    }
    if (modalLastFocused && typeof modalLastFocused.focus === "function") {
      modalLastFocused.focus();
    }
    modalLastFocused = null;
  }

  // --- Deferred-load effects. Runs the user's onConsent callback and
  // injects any googleFonts URLs. Idempotent per controller instance —
  // the second call no-ops, so it's safe to invoke from both "consent
  // restored on boot" and "consent granted just now" paths without
  // worrying about which one ran first.
  function runConsentEffects() {
    if (consentEffectsFired) return;
    consentEffectsFired = true;

    if (opts.googleFonts) injectGoogleFonts(opts.googleFonts);

    if (typeof opts.onConsent === "function") {
      // Failures here shouldn't blow up the consent flow itself — the
      // visitor has already given consent; the side effect not firing
      // cleanly is the caller's problem, not the gate's.
      try {
        opts.onConsent();
      } catch (err) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[easy-cookie-consent] onConsent threw:", err);
        }
      }
    }
  }

  // Inject preconnect (once) + a `<link rel="stylesheet">` per URL.
  // Idempotent: a second call with the same URL won't double-inject. The
  // tags carry `data-easy-cookie-consent` so teardown() (or a debug
  // session) can locate them.
  function injectGoogleFonts(value) {
    const urls = Array.isArray(value) ? value : [value];
    const head = document.head;
    if (!head) return;

    // One preconnect to fonts.gstatic.com is enough for all stylesheets —
    // gstatic is where the actual woff2 files are served from. We don't
    // preconnect to fonts.googleapis.com because the stylesheet link
    // we're about to append handles that origin's connection itself.
    if (!head.querySelector('link[data-easy-cookie-consent="fonts-preconnect"]')) {
      const pre = document.createElement("link");
      pre.rel = "preconnect";
      pre.href = "https://fonts.gstatic.com";
      pre.crossOrigin = "";
      pre.setAttribute("data-easy-cookie-consent", "fonts-preconnect");
      head.appendChild(pre);
    }

    for (const url of urls) {
      if (typeof url !== "string" || !url) continue;
      if (head.querySelector(
        `link[data-easy-cookie-consent="fonts"][href="${cssAttrEscape(url)}"]`
      )) continue;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.setAttribute("data-easy-cookie-consent", "fonts");
      head.appendChild(link);
    }
  }

  // --- Public actions
  function optInAll() {
    storeWrite(KEY_GLOBAL, "1");
    // A prior "not now" no longer reflects what the visitor wants.
    sessionClear(KEY_DECLINED);
    // Swap in any embeds already rendered as placeholders on this page,
    // then fire any imperative gate()s now covered by the global opt-in.
    processEmbeds();
    fireConsentedGates();
    // Deferred loads (analytics, fonts, etc.) fire AFTER storage is
    // written and AFTER placeholders swap — so a callback that introspects
    // the page sees a consistent post-consent state.
    runConsentEffects();
  }

  // Per-provider opt-in. Use for inline "load X" CTAs that gate a fetch
  // or script load (not a built-in iframe embed — those handle their own
  // remember-tick through the placeholder). Writes the per-provider key,
  // swaps in any matching iframe placeholders for symmetry, and is a
  // no-op for an unknown provider id (still writes the key, so a custom
  // gate the host page implements can read it back).
  function optIn(providerId) {
    if (typeof providerId !== "string" || !providerId) return;
    storeWrite(providerId, "1");
    processEmbeds();
    fireConsentedGates();
  }

  function optOutAll() {
    // "Not now" is a tab-scoped decision: we mark it in sessionStorage
    // so subsequent navigations within the visit don't keep re-prompting,
    // but nothing durable is written. Closing the tab (or opening the
    // site in a fresh one) brings the modal back. Per-embed placeholders
    // on this page stay as-is and continue to respond to their individual
    // buttons.
    storeClear(KEY_GLOBAL);
    sessionWrite(KEY_DECLINED, "1");
  }

  // --- Imperative gate. For cases where the post-consent action isn't
  // "drop in an iframe" but "boot a richer integration the host page owns"
  // — YouTube IFrame API for autoplay/loop/state callbacks, an embedded
  // form's JS, a calendar widget that polls a feed. The plugin still
  // handles the consent UI (same copy, same i18n, same "remember"
  // checkbox, same per-provider storage key); only the render-on-consent
  // step is delegated.
  //
  // Pre-granted consent path: `onLoad(container)` fires synchronously. No
  // placeholder UI flashes. The container picks up `.consent-embed--loaded`
  // so any custom CSS that targets the loaded state still applies.
  //
  // Unknown provider ids are accepted on purpose — a host page may want
  // to scope storage under a custom key without registering a full
  // provider entry. The label falls back to the id so the placeholder
  // copy still renders something meaningful.
  function gate(container, gateOpts) {
    if (!container || typeof container.appendChild !== "function") {
      throw new TypeError("gate(container, opts): `container` must be a DOM element");
    }
    if (!gateOpts || typeof gateOpts !== "object") {
      throw new TypeError("gate(container, opts): `opts` is required");
    }
    const providerId = gateOpts.provider;
    const onLoad = gateOpts.onLoad;
    if (typeof providerId !== "string" || !providerId) {
      throw new TypeError("gate(container, opts): `opts.provider` is required");
    }
    if (typeof onLoad !== "function") {
      throw new TypeError("gate(container, opts): `opts.onLoad` must be a function");
    }

    injectStyles();

    const provider = opts.providers[providerId] || {
      label: providerId,
      operator: providerId,
    };

    container.classList.add(
      "consent-embed",
      "consent-embed--" + providerId,
      "consent-embed--gated",
    );

    if (hasConsent(providerId)) {
      container.classList.add("consent-embed--loaded");
      onLoad(container);
      return;
    }

    const entry = { container, providerId, onLoad };
    pendingGates.push(entry);
    const body = buildPlaceholderBody(providerId, provider, () => fireGate(entry));
    container.replaceChildren(body);
  }

  // Run a pending gate()'s onLoad and retire it. Idempotent: the entry is
  // removed from the registry first, so neither a second consent event nor
  // the placeholder's own button can fire onLoad twice.
  function fireGate(entry) {
    const i = pendingGates.indexOf(entry);
    if (i === -1) return;
    pendingGates.splice(i, 1);
    entry.container.replaceChildren();
    entry.container.classList.add("consent-embed--loaded");
    entry.onLoad(entry.container);
  }

  // Fire every pending gate the visitor now has consent for. Iterate a copy —
  // fireGate() mutates pendingGates.
  function fireConsentedGates() {
    for (const entry of pendingGates.slice()) {
      if (hasConsent(entry.providerId)) fireGate(entry);
    }
  }

  // --- Adopt raw third-party embed markup. The headline use case: a CMS
  // editor pastes a `<iframe src="https://youtube.com/embed/…">` (or an
  // `<embed>` / `<object>`) into a field, with no knowledge of the
  // consent-embed convention. adopt() rewrites those into gated
  // placeholders so the src never reaches a live document until consent.
  //
  // Why this is a FULL guarantee, not best-effort: the HTML is parsed with
  // DOMParser into an inert document and imported detached. A browser only
  // fetches an iframe/embed src once the node is connected to the live
  // browsing context — which never happens here, because we strip the src
  // into data-embed and swap in a placeholder *before* the returned
  // fragment is inserted. Contrast a scan of the already-rendered page:
  // there the parser fired the request during initial parse, before any JS
  // ran, and no cleanup can un-send it. So adopt() is the right tool for
  // CLIENT-rendered content (headless CMS, SPA, fetched HTML). For embeds
  // baked into server-delivered HTML, the rewrite has to happen upstream,
  // before the bytes leave the server.
  //
  // What gets gated — <iframe[src]>, <embed[src]>, <object[data]> — but
  // only when the URL is CROSS-ORIGIN. The GDPR trigger is contacting a
  // third-party host, not the element type: a same-origin embed (your own
  // PDF, a local SVG via <object>) contacts no one, and data:/blob: URIs
  // have no host at all — both pass through untouched. Opt out a single
  // node with `data-consent-ignore`; opt out whole hosts with
  // `options.ignoreHosts` (a payment provider you've cleared, your own CDN
  // subdomain).
  //
  // Returns a DocumentFragment with placeholders already wired. Append it
  // (or replaceChildren) — do NOT serialize it back to a string via
  // innerHTML: that drops the click handlers AND, for any embed the
  // visitor already consented to, would re-introduce a live src into the
  // page markup.
  function adopt(html) {
    injectStyles();

    const ignoreHosts = opts.ignoreHosts || [];
    // Parse inert (no resource loads), then import into the live document
    // detached so processEmbeds can build placeholders with live listeners.
    const parsed = new DOMParser().parseFromString(String(html), "text/html");
    const root = document.importNode(parsed.body, true);

    for (const el of root.querySelectorAll("iframe[src], embed[src], object[data]")) {
      if (el.hasAttribute("data-consent-ignore")) continue;
      const rawUrl = el.getAttribute("src") || el.getAttribute("data");
      if (!rawUrl) continue;

      let url;
      try { url = new URL(rawUrl, location.href); } catch { continue; }

      // No host → data:/blob:/about: — contacts no third party, leave it.
      // Same-origin → the host's own content, also no third-party contact.
      if (!url.host || url.host === location.host) continue;

      const bareHost = url.host.replace(/^www\./, "");
      if (ignoreHosts.some((h) => bareHost === h || bareHost.endsWith("." + h))) continue;

      const providerId = providerForUrl(url.href) || ensureExternalProvider(url.host);

      const gateNode = document.createElement("div");
      gateNode.className = "consent-embed";
      gateNode.dataset.provider = providerId;
      gateNode.dataset.embed = url.href;

      // Carry the embed's intrinsic ratio so the placeholder reserves the
      // right box and the swap doesn't reflow. Only when both dims are
      // numeric (px); percentage/auto sizing falls back to the CSS default.
      const w = parseInt(el.getAttribute("width"), 10);
      const h = parseInt(el.getAttribute("height"), 10);
      if (w > 0 && h > 0) gateNode.style.aspectRatio = w + " / " + h;

      // Preserve the pasted embed's accessible name (WCAG 4.1.2) so the
      // post-consent iframe keeps the title the CMS author wrote. Without
      // this the gate would silently *degrade* accessibility on adopt.
      const title = el.getAttribute("title");
      if (title) gateNode.dataset.title = title;

      el.replaceWith(gateNode);
    }

    // Render placeholders / wire click handlers on the detached tree, then
    // hand back a fragment for the caller to insert.
    processEmbeds(root);
    const fragment = document.createDocumentFragment();
    fragment.append(...root.childNodes);
    return fragment;
  }

  function reset() {
    // Wipe all consent state. Used by a "revoke consent" link on the
    // privacy page. Iframes already rendered on the current page stay
    // loaded — a reload is needed to re-gate them.
    for (const key of [KEY_GLOBAL, ...Object.keys(opts.providers)]) {
      storeClear(key);
    }
    sessionClear(KEY_DECLINED);
  }

  function teardown() {
    closeModal();
    // Drop any still-pending gate closures — the controller is going away,
    // so their onLoads must not fire from a stale consent event. The
    // placeholder DOM they left behind stays put (see note below).
    pendingGates.length = 0;
    if (stylesEl) {
      stylesEl.remove();
      stylesEl = null;
    }
    // Note: already-rendered placeholders and already-loaded iframes are
    // left in place. teardown() removes the runtime, not the DOM the
    // runtime has already produced — that decision belongs to the host
    // page (typically by re-rendering on its own terms).
  }

  // --- Boot. We don't auto-defer to DOMContentLoaded — the contract is
  // "call me when the embed DOM exists." If you put the script in <head>,
  // use `defer` or place the call at the end of <body>. This matches the
  // expectations of an explicit-init library.
  injectStyles();
  processEmbeds();

  // Restore deferred effects synchronously if the visitor opted in on a
  // previous page. Runs BEFORE the modal-show check so the page never
  // shows the consent prompt while simultaneously firing onConsent.
  if (hasGlobalConsent()) runConsentEffects();

  const suppressedByAttr = document.body
    && document.body.hasAttribute(opts.noPromptAttribute);
  if (
    opts.showModal
    && !suppressedByAttr
    && !onPrivacyPage()
    && !hasGlobalConsent()
    && !hasDeclinedThisSession()
  ) {
    showModal();
  }

  return {
    show: showModal,
    optInAll,
    optIn,
    optOutAll,
    reset,
    teardown,
    // `hasConsent()` — no argument — answers "did the visitor opt in to
    // everything?". `hasConsent("googlesheets")` answers "is that specific
    // provider OK to use right now?" (true if the visitor opted in globally
    // or remembered this provider individually). Use the per-provider form
    // when gating a fetch / script load behind an inline CTA.
    hasConsent,
    // Imperative consent gate. Use when the post-consent action is
    // something richer than an iframe swap — boot the YouTube IFrame
    // API, mount an embedded form, kick off a calendar feed. See
    // README → "Imperative gate (custom render after consent)".
    gate,
    // Rewrite raw third-party embed markup (a CMS-pasted <iframe>,
    // <embed>, or <object>) into gated placeholders before it hits the
    // page. Returns a DocumentFragment to append — never contacts the
    // third party until consent. See README → "Adopting raw embeds".
    adopt,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

// Shallow-merge two-level deep where it matters (colors, embedHeights,
// providers, strings). Anything else is a top-level replace. This is on
// purpose — we want callers to override individual color tokens without
// having to redeclare the whole palette, but it's not worth a generic
// deep-merge implementation for a 4-key config object.
function mergeOptions(base, user) {
  const out = { ...base, ...user };
  out.colors = { ...base.colors, ...(user.colors || {}) };
  out.embedHeights = { ...base.embedHeights, ...(user.embedHeights || {}) };
  out.providers = mergeProviders(base.providers, user.providers);
  out.strings = mergeStrings(base.strings, user.strings);
  return out;
}

function mergeProviders(base, user) {
  if (!user) return base;
  const out = { ...base };
  for (const [id, provider] of Object.entries(user)) {
    out[id] = {
      ...(base[id] || {}),
      ...provider,
      iframeAttrs: {
        ...((base[id] && base[id].iframeAttrs) || {}),
        ...(provider.iframeAttrs || {}),
      },
    };
  }
  return out;
}

function mergeStrings(base, user) {
  if (!user) return base;
  const out = { ...base };
  for (const [lang, table] of Object.entries(user)) {
    out[lang] = {
      modal: { ...((base[lang] && base[lang].modal) || {}), ...(table.modal || {}) },
      placeholder: {
        ...((base[lang] && base[lang].placeholder) || {}),
        ...(table.placeholder || {}),
        actionLabel: {
          ...((base[lang] && base[lang].placeholder && base[lang].placeholder.actionLabel) || {}),
          ...((table.placeholder && table.placeholder.actionLabel) || {}),
        },
      },
    };
  }
  return out;
}

// Escape a string for safe use inside a CSS attribute selector value —
// just the characters that would break out of the surrounding `"…"`.
// Used by the Google Fonts injector's "already there?" check; we don't
// want a stray quote in the user's URL to throw a SyntaxError.
function cssAttrEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Emit one `.consent-embed--<provider> { height: <px>px }` line per
// provider that has an explicit height override. Generated rather than
// hand-listed so callers can add a provider via options without also
// having to touch the CSS in the module.
function perProviderHeights(heights) {
  return Object.entries(heights)
    .filter(([id]) => id !== "default")
    .map(([id, px]) => `.consent-embed--${id} { height: ${px}px; }`)
    .join("\n      ");
}
