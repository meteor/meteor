import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './main.html';

// ===== PWA install prompt =====
// Capture the browser's deferred install prompt so a custom button can trigger
// it. Fires on Chromium only; Safari/Firefox surface their own install UI.
const installEvent = new ReactiveVar(null);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent.set(event);
});
window.addEventListener('appinstalled', () => installEvent.set(null));

Template.installPrompt.helpers({
  canInstall() {
    return Boolean(installEvent.get());
  },
});

Template.installPrompt.events({
  async 'click .pwa-install'() {
    const event = installEvent.get();
    if (!event) return;
    installEvent.set(null);
    event.prompt();
    await event.userChoice;
  },
});

// ===== PWA service worker =====
// Dev-safe registration: `/sw.js?dev=1` in development keeps the app installable
// but never caches the app bundle, so Meteor's hot-code-push / autoupdate never
// fights a stale cache (no reload loop). `/sw.js` in production enables the full
// offline caching of static assets. NOTE: this baseline caches the app shell and
// static assets only — offline data (collections, Methods, sync) is intentionally
// out of scope here; see the README / future `--offline-data` option.
Meteor.startup(() => {
  if (!('serviceWorker' in navigator)) return;
  const swUrl = Meteor.isProduction ? '/sw.js' : '/sw.js?dev=1';
  navigator.serviceWorker
    .register(swUrl, { scope: '/' })
    .catch((err) => console.error('[PWA] Service worker registration failed', err));
});

Template.hello.onCreated(function helloOnCreated() {
  // counter starts at 0
  this.counter = new ReactiveVar(0);
});

Template.hello.helpers({
  counter() {
    return Template.instance().counter.get();
  },
});

Template.hello.events({
  'click button'(event, instance) {
    // increment the counter when button is clicked
    instance.counter.set(instance.counter.get() + 1);
  },
});
