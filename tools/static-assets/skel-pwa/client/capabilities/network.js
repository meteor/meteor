import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './network.html';

const isOnline = new ReactiveVar(typeof navigator !== 'undefined' ? navigator.onLine : true);
const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
const connTick = new ReactiveVar(0);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => isOnline.set(true));
  window.addEventListener('offline', () => isOnline.set(false));
  if (conn) conn.addEventListener('change', () => connTick.set(connTick.get() + 1));
}

Template.networkPanel.helpers({
  statusText() { return isOnline.get() ? 'Online' : 'Offline'; },
  statusClass() { return isOnline.get() ? 'ok' : 'ko'; },
  hasConnectionInfo() { return Boolean(conn); },
  effectiveType() { connTick.get(); return conn?.effectiveType || '?'; },
  downlink() { connTick.get(); return conn?.downlink ?? '?'; },
  rtt() { connTick.get(); return conn?.rtt ?? '?'; },
});
