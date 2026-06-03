// Tauri runtime bridge for Meteor's Hot Code Push.
//
// In a packaged Tauri app the client assets are served from disk by the native
// `meteor-webapp` Tauri plugin (Rust), mirroring cordova-plugin-meteor-webapp.
// This file exposes a `WebAppLocalServer` global with the same shape the
// autoupdate package expects, backed by the Tauri command/event bridge.
//
// We talk to the plugin through the global Tauri API (`window.__TAURI__`),
// which is available when `app.withGlobalTauri` is enabled in tauri.conf.json
// (the Meteor Tauri builder sets this automatically).

const PLUGIN = 'meteor-webapp';

function getTauri() {
  return (typeof window !== 'undefined' && window.__TAURI__) || null;
}

function invoke(command, args) {
  const tauri = getTauri();
  if (!tauri || !tauri.core || typeof tauri.core.invoke !== 'function') {
    return Promise.reject(
      new Error('Tauri API is not available; is this running inside a Tauri webview?')
    );
  }
  return tauri.core.invoke(`plugin:${PLUGIN}|${command}`, args || {});
}

function listen(event, handler) {
  const tauri = getTauri();
  if (!tauri || !tauri.event || typeof tauri.event.listen !== 'function') {
    // No event bridge available; return a no-op unlisten.
    return Promise.resolve(() => {});
  }
  return tauri.event.listen(event, (e) => handler(e && e.payload));
}

const errorCallbacks = [];
const newVersionReadyCallbacks = [];

// Wire native events to the registered JS callbacks.
listen(`${PLUGIN}://error`, (payload) => {
  const error = new Error((payload && payload.message) || 'Unknown error');
  errorCallbacks.forEach((cb) => cb(error));
});

listen(`${PLUGIN}://new-version-ready`, () => {
  newVersionReadyCallbacks.forEach((cb) => cb());
});

// The global the autoupdate package (and user code) interacts with. Mirrors the
// API surface of cordova-plugin-meteor-webapp's WebAppLocalServer.
window.WebAppLocalServer = {
  onError(callback) {
    errorCallbacks.push(callback);
  },

  onNewVersionReady(callback) {
    newVersionReadyCallbacks.push(callback);
  },

  checkForUpdates() {
    return invoke('check_for_updates').catch((error) => {
      errorCallbacks.forEach((cb) => cb(error));
    });
  },

  // Called by the autoupdate flow once the new version has been switched to and
  // the app has started successfully, so the native side can mark it good.
  startupDidComplete(callback) {
    return invoke('startup_did_complete')
      .then(() => callback && callback())
      .catch(() => callback && callback());
  },

  switchPendingVersion(callback) {
    return invoke('switch_pending_version')
      .then(() => callback && callback())
      .catch(() => callback && callback());
  },
};

Meteor.startup(() => {
  WebAppLocalServer.onError((error) => {
    console.error(error);
  });
});
