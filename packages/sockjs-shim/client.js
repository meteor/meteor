export function importSockJS() {
  if (typeof global.SockJS === "function") {
    if (SockJS !== global.SockJS) {
      // Keep the package-scoped SockJS variable up to date with the
      // global one defined by a separate <script> tag.
      SockJS = global.SockJS;
    }

    // No need to import sockjs-0.3.4.js dynamically if it was already
    // defined globally.
    return Promise.resolve();
  }

  return import("./sockjs-0.3.4.js").then(() => {
    // Export the package-scoped variable as global.
    global.SockJS = SockJS;
  });
}
