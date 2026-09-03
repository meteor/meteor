import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './main.html';
import './todos.js';
import './capabilities.js';

const DISMISS_KEY = 'pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const installPromptEvent = new ReactiveVar(null);
const isInstalled = new ReactiveVar(
  typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      window.navigator.standalone === true)
);
const activeTab = new ReactiveVar('todos');

function recentlyDismissed() {
  const at = Number(localStorage.getItem(DISMISS_KEY));
  return Number.isFinite(at) && Date.now() - at < DISMISS_COOLDOWN_MS;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent.set(e);
});

window.addEventListener('appinstalled', () => {
  isInstalled.set(true);
  installPromptEvent.set(null);
  localStorage.removeItem(DISMISS_KEY);
});

Meteor.startup(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => console.log('[PWA] Service worker registered, scope:', reg.scope))
      .catch((err) => console.error('[PWA] Service worker registration failed', err));
  }
});

Template.body.helpers({
  isTab(name) {
    return activeTab.get() === name;
  },
  tabClass(name) {
    return activeTab.get() === name ? 'tab--active' : '';
  },
});

Template.body.events({
  'click .tab'(event) {
    activeTab.set(event.currentTarget.dataset.tab);
  },
});

Template.installPanel.helpers({
  canInstall() {
    return Boolean(installPromptEvent.get()) && !isInstalled.get() && !recentlyDismissed();
  },
  isInstalled() {
    return isInstalled.get();
  },
});

Template.installPanel.events({
  async 'click .install-btn'() {
    const ev = installPromptEvent.get();
    if (!ev) return;
    ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'dismissed') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
    installPromptEvent.set(null);
  },
  'click .dismiss-btn'() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    installPromptEvent.set(null);
  },
});
