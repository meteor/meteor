import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';

import './capabilities.html';
import './capabilities/network.js';
import './capabilities/notifications.js';
import './capabilities/share.js';
import './capabilities/camera.js';
import './capabilities/detect.js';

const activeSubTab = new ReactiveVar('network');

Template.capabilitiesPanel.helpers({
  isSubTab(name) {
    return activeSubTab.get() === name;
  },
  subTabClass(name) {
    return activeSubTab.get() === name ? 'subtab--active' : '';
  },
});

Template.capabilitiesPanel.events({
  'click .subtab'(event) {
    activeSubTab.set(event.currentTarget.dataset.subtab);
  },
});
