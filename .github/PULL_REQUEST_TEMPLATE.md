<!--
Thanks for the PR. A few prompts to make review faster — delete anything
that doesn't apply.
-->

## What

<!-- One or two sentences. What this PR changes. -->

## Why

<!-- The motivating problem. A real site, a real provider quirk, a real
     translation gap. Skip the WHAT (the diff shows it); the WHY is what
     I'm reading for. -->

## How tested

<!-- Which browser(s) + OS you exercised it in. Private window for fresh
     localStorage state. A short screen recording for anything visible
     saves a lot of back-and-forth. -->

- [ ] Opened `example.html` in a fresh private window and confirmed:
      modal shows → "Allow all" loads embeds → reload, no modal
- [ ] Reset consent → "Not now" closes without persisting → reload,
      modal shows again
- [ ] Per-embed "remember" checkbox: tick + allow → reload → that
      embed loads directly, others still gated
- [ ] Spot-checked in at least one non-Chromium browser (Safari or Firefox)
- [ ] If teardown / event-listener code touched: confirmed `teardown()`
      actually removes the injected `<style data-easy-cookie-consent>`

## Notes for reviewer

<!-- Anything subtle: a GDPR-interpretation choice, a browser quirk you
     worked around, a follow-up you considered but punted. Optional. -->
