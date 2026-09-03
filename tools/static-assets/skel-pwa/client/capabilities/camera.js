import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './camera.html';

const supported = typeof navigator !== 'undefined'
  && !!navigator.mediaDevices
  && 'getUserMedia' in navigator.mediaDevices;

Template.cameraPanel.onCreated(function () {
  this.mode = new ReactiveVar('idle');           // 'idle' | 'live' | 'snapshot'
  this.status = new ReactiveVar('');
  this.snapshotUrl = new ReactiveVar(null);
  this.stream = null;
});

// Runs when the user switches sub-tabs, because the parent uses
// {{#if isSubTab 'camera'}}{{> cameraPanel}}{{/if}} which destroys the
// instance. Without this cleanup, the webcam LED stays on after leaving the tab.
Template.cameraPanel.onDestroyed(function () {
  if (this.stream) {
    this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
  const url = this.snapshotUrl.get();
  if (url) URL.revokeObjectURL(url);
});

Template.cameraPanel.helpers({
  supported() { return supported; },
  isIdle() { return Template.instance().mode.get() === 'idle'; },
  isLive() { return Template.instance().mode.get() === 'live'; },
  isSnapshot() { return Template.instance().mode.get() === 'snapshot'; },
  snapshotUrl() { return Template.instance().snapshotUrl.get(); },
  status() { return Template.instance().status.get(); },
});

Template.cameraPanel.events({
  async 'click [data-action="start"]'(event, instance) {
    try {
      instance.stream = await navigator.mediaDevices.getUserMedia({ video: true });
      instance.mode.set('live');
      instance.status.set('');
      // Defer attaching the stream so the <video> element exists in the DOM after Blaze re-renders.
      Meteor.defer(() => {
        const video = instance.find('video.cap-video');
        if (video) video.srcObject = instance.stream;
      });
    } catch (e) {
      instance.status.set(
        e.name === 'NotAllowedError'
          ? 'Permission denied. Re-enable in browser settings.'
          : `Camera error: ${e.message}`
      );
    }
  },
  'click [data-action="snapshot"]'(event, instance) {
    const video = instance.find('video.cap-video');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      const prevUrl = instance.snapshotUrl.get();
      if (prevUrl) URL.revokeObjectURL(prevUrl);
      instance.snapshotUrl.set(URL.createObjectURL(blob));
      instance.mode.set('snapshot');
      Meteor.defer(() => {
        const c = instance.find('canvas.cap-canvas');
        if (c) {
          c.width = canvas.width;
          c.height = canvas.height;
          c.getContext('2d').drawImage(canvas, 0, 0);
        }
      });
    });
  },
  'click [data-action="stop"]'(event, instance) {
    if (instance.stream) {
      instance.stream.getTracks().forEach((t) => t.stop());
      instance.stream = null;
    }
    instance.mode.set('idle');
  },
  'click [data-action="reset"]'(event, instance) {
    const url = instance.snapshotUrl.get();
    if (url) URL.revokeObjectURL(url);
    instance.snapshotUrl.set(null);
    if (instance.stream) {
      instance.stream.getTracks().forEach((t) => t.stop());
      instance.stream = null;
    }
    instance.mode.set('idle');
  },
});
