// Deterministic marker string for the client bundle.
//
// The rspack plugin writes a placeholder `client-rspack.js` for any client
// side it does NOT compile. A real compiled client bundle contains this marker
// (the string literal survives an unminified test/dev build); a placeholder
// does not. Self-tests read the built `*-rspack.js` file and check for this
// marker to tell "the client was actually bundled" from "the client is still
// the empty stub" — the difference between an app that renders in the browser
// and one that loads no client code.
console.log('RSPACK_CLIENT_APP_MARKER client main module loaded');
