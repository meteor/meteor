import React, { FC } from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';
import { App } from '/imports/ui/App';

Meteor.startup(() => {
  const container: HTMLElement | null = document.getElementById('react-target');
  const root = createRoot(container);
  root.render(<App />);
});
