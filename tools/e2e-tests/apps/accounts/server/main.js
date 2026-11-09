import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

import './fake-mailer.js';
import './fake-oauth-service.js';
import './express-routes.js';
import './publications.js';
import './methods/reset.js';
import './methods/users.js';
import './methods/emails.js';
import './methods/auth.js';

Accounts.emailTemplates.from = 'e2e-accounts <no-reply@example.com>';
Accounts.emailTemplates.siteName = 'AccountsE2E';

Meteor.startup(() => {
  console.log('accounts e2e app: ready');
});
