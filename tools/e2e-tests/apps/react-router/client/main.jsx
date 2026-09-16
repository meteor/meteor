import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { App } from '/imports/ui/App';
import '@helper/alias';
import ReactAlias from '@react/alias';

console.log('@react/alias loaded', ReactAlias.version);

let root;

Meteor.startup(() => {
  const container = document.getElementById('react-target'); // your container id
  if (!root) {
    root = createRoot(container); // create once
  }
  root.render(<App />);
});
