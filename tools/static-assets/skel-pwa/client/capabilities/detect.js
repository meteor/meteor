import { Template } from 'meteor/templating';
import './detect.html';

const win = typeof window === 'undefined' ? null : window;
const nav = typeof navigator === 'undefined' ? null : navigator;

const FEATURES = !win ? [] : [
  { name: 'Service Worker',       supported: 'serviceWorker' in nav,                                                  url: 'https://caniuse.com/serviceworkers' },
  { name: 'Push Manager',         supported: 'PushManager' in win,                                                    url: 'https://caniuse.com/push-api' },
  { name: 'Notification',         supported: 'Notification' in win,                                                   url: 'https://caniuse.com/notifications' },
  { name: 'Web Share',            supported: 'share' in nav,                                                          url: 'https://caniuse.com/web-share' },
  { name: 'Clipboard read',       supported: !!(nav.clipboard && 'readText' in nav.clipboard),                        url: 'https://caniuse.com/mdn-api_clipboard_readtext' },
  { name: 'Clipboard write',      supported: !!(nav.clipboard && 'writeText' in nav.clipboard),                       url: 'https://caniuse.com/mdn-api_clipboard_writetext' },
  { name: 'getUserMedia',         supported: !!(nav.mediaDevices && 'getUserMedia' in nav.mediaDevices),              url: 'https://caniuse.com/stream' },
  { name: 'Web Bluetooth',        supported: 'bluetooth' in nav,                                                      url: 'https://caniuse.com/web-bluetooth' },
  { name: 'WebUSB',               supported: 'usb' in nav,                                                            url: 'https://caniuse.com/webusb' },
  { name: 'Vibration',            supported: 'vibrate' in nav,                                                        url: 'https://caniuse.com/vibration' },
  { name: 'Wake Lock',            supported: 'wakeLock' in nav,                                                       url: 'https://caniuse.com/wake-lock' },
  { name: 'Battery',              supported: 'getBattery' in nav,                                                     url: 'https://caniuse.com/battery-status' },
  { name: 'File System Access',   supported: 'showOpenFilePicker' in win,                                             url: 'https://caniuse.com/native-filesystem-api' },
  { name: 'Background Sync',      supported: 'SyncManager' in win,                                                    url: 'https://caniuse.com/background-sync' },
  { name: 'Periodic Sync',        supported: 'serviceWorker' in nav && 'periodicSync' in (win.ServiceWorkerRegistration?.prototype || {}), url: 'https://caniuse.com/periodic-background-sync' },
  { name: 'beforeinstallprompt',  supported: 'onbeforeinstallprompt' in win,                                          url: 'https://caniuse.com/web-app-manifest' },
];

Template.detectPanel.helpers({
  features() { return FEATURES; },
});
