import { Meteor } from 'meteor/meteor';
import { datadogRum } from '@datadog/browser-rum';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { describeBrowser } from '../imports/browser-info';

Meteor.startup(() => {
  const browser = describeBrowser();
  datadogRum.addAction('modern-browser', { browser });
  createRoot(document.getElementById('architecture-entry')!).render(
    <h2>Modern app / {browser} / architecture-modern-entry</h2>
  );
});
