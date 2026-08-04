import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { App } from '/imports/ui/App';

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  const root = createRoot(container);
  root.render(<App />);

  import('/imports/ui/lazy.js').then(({ lazyValue }) => {
    window.__rspackE2eLazyValue = lazyValue;
  });
});
