import { Meteor } from 'meteor/meteor';
import App from '../imports/ui/App.svelte';
import { mount, unmount } from 'svelte';

let app; // will hold the mounted instance

Meteor.startup(() => {
  const target = document.getElementById('app');

  // (Re)mount
  app = mount(App, { target });

  // Clean up on HMR so we don't double-mount
  if (import.meta.webpackHot) {
    import.meta.webpackHot.accept();
    import.meta.webpackHot.dispose(() => {
      if (app) {
        // pass the instance you got from mount()
        unmount(app, { outro: false }); // set outro:true if you want transitions
        app = null;
      }
      // optional: clear target to be extra safe
      target.innerHTML = '';
    });
  }
});
