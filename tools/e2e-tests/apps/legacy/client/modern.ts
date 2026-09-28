import { Meteor } from 'meteor/meteor';
import '../imports/main.css';

Meteor.startup(() => {
  document.getElementById('architecture-entry')!.textContent = 'architecture-modern-entry';
  import('../imports/lazy').then(({ getBuildArch }) => {
    document.getElementById('architecture-entry')!.setAttribute('data-rspack', getBuildArch());
  });
});
