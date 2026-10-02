import { Meteor } from 'meteor/meteor';
import { datadogRum } from '@datadog/browser-rum';
import { describeBrowser } from '../imports/browser-info';

Meteor.startup(() => {
  const browser = describeBrowser();
  // Exercise the SDK import without initializing a telemetry connection.
  datadogRum.addAction('legacy-browser', { browser });
  document.getElementById('architecture-entry')!.textContent =
    `Your browser is not supported / ${browser} / architecture-legacy-entry`;
});
