import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './notifications.html';

const supported = typeof window !== 'undefined' && 'Notification' in window;
const perm = new ReactiveVar(supported ? Notification.permission : 'unsupported');
const status = new ReactiveVar('');

Template.notificationsPanel.helpers({
  supported() { return supported; },
  perm() { return perm.get(); },
  permClass() {
    const p = perm.get();
    if (p === 'granted') return 'ok';
    if (p === 'denied') return 'ko';
    return 'pending';
  },
  isDefault() { return perm.get() === 'default'; },
  isGranted() { return perm.get() === 'granted'; },
  isDenied() { return perm.get() === 'denied'; },
  status() { return status.get(); },
});

Template.notificationsPanel.events({
  async 'click [data-action="request"]'() {
    const result = await Notification.requestPermission();
    perm.set(result);
    status.set(`Permission ${result}.`);
  },
  async 'click [data-action="send"]'() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        status.set('Service worker not ready — reload the page once.');
        return;
      }
      await reg.showNotification('Hello from PWA scaffold', {
        body: 'Notifications work! Edit notifications.js to customize.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'pwa-scaffold-test',
      });
      status.set('Test notification sent.');
    } catch (e) {
      status.set(`Notification failed: ${e.message}`);
    }
  },
});
