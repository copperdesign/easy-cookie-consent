// Assert that every version string outside package.json still agrees with it.
//
// Two of these have already drifted in the wild. The `/*! ... */` banner sat
// at v0.5.1 through two releases because CI only ever checked that the banner
// existed, not what it said. The README's CDN URLs are worse: they're pinned
// on purpose (an unpinned consent gate can change what loads before the
// visitor agrees to anything), and a stale pin means the install instructions
// hand new users an old build while npm serves the new one.
//
// Neither is caught by `npm version`, which only rewrites package.json — so
// it gets caught here instead, on every push.

import { readFileSync } from "node:fs";

const expected = JSON.parse(readFileSync("package.json", "utf8")).version;
const problems = [];

// --- The preserve banner, e.g. `/*! easy-cookie-consent — v0.6.2 - 2026-08-10`
const banner = readFileSync("index.js", "utf8").split("\n", 1)[0];
const bannerVersion = banner.match(/v(\d+\.\d+\.\d+)/);
if (!bannerVersion) {
  problems.push(`index.js banner has no vX.Y.Z version: ${banner}`);
} else if (bannerVersion[1] !== expected) {
  problems.push(`index.js banner says v${bannerVersion[1]}, package.json says ${expected}`);
}

// --- Every pinned CDN URL in the README (jsDelivr, unpkg, anything else that
// serves the npm package by `name@version`).
const readme = readFileSync("README.md", "utf8").split("\n");
readme.forEach((line, i) => {
  const pins = line.matchAll(/@copperdesign\/easy-cookie-consent@(\d+\.\d+\.\d+)/g);
  for (const pin of pins) {
    if (pin[1] !== expected) {
      problems.push(`README.md:${i + 1} pins @${pin[1]}, package.json says ${expected}`);
    }
  }
});

if (problems.length) {
  console.error("Version references out of sync:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nBump them to ${expected}, or run the release in one commit so they can't diverge.`);
  process.exit(1);
}

console.log(`All version references agree: ${expected}`);
