// Deterministic marker string for the server bundle. It serves two purposes:
//
// 1. Printed to stdout at boot, so a self-test can `run.match()` it to confirm
//    full-app mode actually loaded the app's main server module (the CONFIG_SERVER
//    value shows which build-context entry file Meteor loaded it through).
// 2. Present in the compiled `server-rspack.js` on disk. In a dev server the
//    client is served over HMR (its client-rspack.js stays a stub), so the
//    server bundle is the only side written to disk with real app code — the
//    concurrent-mode self-tests grep it to prove a dev build survived a
//    concurrent `meteor test` run rather than being clobbered to a placeholder.
console.log(`RSPACK_SERVER_APP_MARKER CONFIG_SERVER=${process.env.METEOR_CONFIG_SERVER || ''}`);
