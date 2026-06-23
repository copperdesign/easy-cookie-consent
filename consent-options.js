// Shared consent options for the demo pages. Single-sourcing `privacyHref`
// is the point: the modal's auto-suppress only fires when the visitor's
// route matches privacyHref, so example.html and privacy.html MUST agree
// on it. Inline the string in two files and they'll drift — and the bug
// is silent (the modal just stops suppressing). One config, many pages.
export default {
	privacyHref: 'privacy.html',
	// Deferred Google Fonts loader — injected only after global consent.
	googleFonts: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
};
