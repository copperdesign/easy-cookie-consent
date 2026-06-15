/*! easy-cookie-consent — v0.3.2 - 2026-06-15
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
  // demos.
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
      iframeAttrs: {
        frameborder: "0",
        allow: "autoplay; encrypted-media",
        allowfullscreen: "",
      },
    },
    vimeo: {
      label: "Vimeo",
      operator: "Vimeo, Inc., USA",
      iframeAttrs: {
        frameborder: "0",
        allow: "autoplay; fullscreen; picture-in-picture",
        allowfullscreen: "",
      },
    },
    soundcloud: {
      label: "SoundCloud",
      operator: "SoundCloud Global Ltd. & Co. KG, Berlin",
      iframeAttrs: {
        frameborder: "no",
        scrolling: "no",
        allow: "autoplay",
      },
    },
    gmaps: {
      label: "Google Maps",
      operator: "Google LLC, USA",
      iframeAttrs: {
        frameborder: "0",
        allowfullscreen: "",
        style: "border:0",
      },
    },
    gsheets: {
      label: "Google Sheets",
      operator: "Google LLC, USA",
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
      iframeAttrs: {
        frameborder: "0",
        scrolling: "no",
        style: "border:0",
      },
    },
    betterplace: {
      label: "betterplace.org",
      operator: "gut.org gAG, Berlin",
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
          "Loading it transfers data to those providers. You can consent " +
          "once for all of them here, or decide individually per embed. " +
          "Details in the ",
        privacyLinkLabel: "privacy policy",
        optInLabel: "Allow all external content",
        optOutLabel: "Not now",
        closeLabel: "Close",
      },
      placeholder: {
        label: (p) => `External content from ${p}`,
        hint: (op) => `Loading transfers data to ${op}. Details in the `,
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
          "Diese Seite lädt externe Inhalte von Drittanbietern. Dabei " +
          "werden Daten an diese Anbieter übertragen. Du kannst hier " +
          "allem auf einmal zustimmen — oder einzeln pro Embed " +
          "entscheiden. Mehr dazu in der ",
        privacyLinkLabel: "Datenschutzerklärung",
        optInLabel: "Alle externen Inhalte zulassen",
        optOutLabel: "Nicht jetzt",
        closeLabel: "Schließen",
      },
      placeholder: {
        label: (p) => `Externer Inhalt von ${p}`,
        hint: (op) => `Beim Laden werden Daten an ${op} übertragen. Mehr dazu in der `,
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

  // --- Per-embed placeholder. Minimal DOM on purpose: one labelled block,
  // one button, one optional "remember" checkbox. No fake play button, no
  // remote-fetched thumbnail (that would itself be a third-party request,
  // defeating the point of the gate).
  function renderPlaceholder(node, providerId, provider) {
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
    node.replaceChildren(body);

    button.addEventListener("click", () => {
      if (checkbox.checked) storeWrite(providerId, "1");
      swapInIframe(node, provider);
    });
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
    node.replaceChildren(iframe);
    node.classList.add("consent-embed--loaded");
  }

  function processEmbeds(root = document) {
    const nodes = root.querySelectorAll(".consent-embed[data-provider][data-embed]");
    for (const node of nodes) {
      const providerId = node.dataset.provider;
      const provider = opts.providers[providerId];
      if (!provider) continue; // unknown provider — leave the node alone so it's visible in dev
      if (hasConsent(providerId)) {
        swapInIframe(node, provider);
      } else {
        renderPlaceholder(node, providerId, provider);
      }
    }
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
      /* Once loaded, the wrapper just holds the iframe — strip its framing
         so the iframe fills the slot edge-to-edge. */
      .consent-embed--loaded { background: transparent; padding: 0; }
      .consent-embed--loaded iframe {
        display: block; width: 100%; height: 100%; border: 0;
      }
      .consent-embed--loaded.consent-embed--gmaps iframe { border-radius: 0; }

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
    // Swap in any embeds already rendered as placeholders on this page.
    processEmbeds();
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
