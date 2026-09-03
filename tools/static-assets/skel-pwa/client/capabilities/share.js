import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './share.html';

const supported = typeof navigator !== 'undefined' && 'share' in navigator;
const status = new ReactiveVar('');

Template.sharePanel.helpers({
  supported() { return supported; },
  status() { return status.get(); },
});

Template.sharePanel.events({
  async 'submit .share-form'(event) {
    event.preventDefault();
    const data = {
      title: event.target.elements.title.value,
      text: event.target.elements.text.value,
      url: event.target.elements.url.value,
    };
    try {
      await navigator.share(data);
      status.set('Shared successfully.');
    } catch (e) {
      if (e.name === 'AbortError') status.set('Share cancelled.');
      else status.set(`Share failed: ${e.message}`);
    }
  },
});
