import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { Offline } from 'meteor/offline';

import { Links } from '/imports/api/links/links.js';
import '/imports/api/links/methods.js';
import './main.html';

// ===== Offline data =====
// Keeps the published links and the calls to `links.insert` on the device: the
// list is there on the next load even without network, and a link added while
// offline reaches the server once the connection is back. Started before the
// first subscription, as the `offline` package requires.
Offline.start({ collections: [Links], methods: ['links.insert'] });
Meteor.subscribe('links');

const pendingCalls = new ReactiveVar(0);
const countPendingCalls = () => Offline.pending().then((calls) => pendingCalls.set(calls.length));
['ready', 'method.queued', 'method.done', 'method.failed', 'method.dropped'].forEach((type) =>
  Offline.on(type, countPendingCalls),
);

Template.links.helpers({
  links() {
    return Links.find({}, { sort: { createdAt: -1 } });
  },
  connected() {
    return Meteor.status().connected;
  },
  pendingCalls() {
    return pendingCalls.get();
  },
});

Template.links.events({
  async 'submit .link-form'(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.title.value.trim();
    const url = form.url.value.trim();
    if (!title || !url) return;
    form.reset();
    try {
      // Resolves once the server has answered, after the reconnection if any.
      await Meteor.callAsync('links.insert', { _id: Random.id(), title, url });
    } catch (error) {
      console.error('[links] insert rejected', error);
    }
  },
});

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
// offline caching of static assets. The data side (collections, Method calls)
// is the `offline` package's job, see the top of this file.
Meteor.startup(() => {
  // A path-prefixed ROOT_URL (https://example.com/app) serves everything under
  // the prefix, so the static <head> links and the worker URL/scope need it.
  const prefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX || '';
  if (prefix) {
    document
      .querySelectorAll('link[rel="manifest"], link[rel="apple-touch-icon"]')
      .forEach((link) => link.setAttribute('href', prefix + link.getAttribute('href')));
  }

  if (!('serviceWorker' in navigator)) return;
  const swUrl = `${prefix}/sw.js${Meteor.isProduction ? '' : '?dev=1'}`;
  navigator.serviceWorker
    .register(swUrl, { scope: `${prefix}/` })
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
