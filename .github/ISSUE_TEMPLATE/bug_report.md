---
name: Bug report
about: Something broke or behaved unexpectedly
title: ''
labels: bug
assignees: ''
---

## What happened

<!-- One paragraph. What you set up, what you saw, what you expected. -->

## Repro

<!-- A minimal HTML page that reproduces it. A Gist or CodePen link is
     fine. The smaller the repro, the faster the fix. -->

```html
<div class="consent-embed"
     data-provider="youtube"
     data-embed="https://www.youtube.com/embed/...">
</div>

<script type="module">
  import easyCookieConsent from '@copperdesign/easy-cookie-consent';
  easyCookieConsent({ /* options */ });
</script>
```

## Environment

- Package version (from `package.json` or `npm ls @copperdesign/easy-cookie-consent`):
- Browser + version:
- OS (+ mobile/desktop):
- Private window? (changes `localStorage` behavior):

## Screen recording (optional)

<!-- For anything visual — modal styling, focus glitches, placeholder
     rendering — a short clip is worth a thousand words. -->
