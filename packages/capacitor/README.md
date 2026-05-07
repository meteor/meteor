# capacitor

Integrates [CapacitorJS](https://capacitorjs.com) into the Meteor build lifecycle. Reuses Meteor's existing `web.cordova` build output and transforms it into a Capacitor `webDir` (`build-native/`) so iOS/Android shells can be built with `npx cap sync` / `npx cap run`.
