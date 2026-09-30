import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { check, Match } from 'meteor/check';

import { clearSentEmails } from '../fake-mailer.js';
import { applyHooks, resetHooks } from '../hooks.js';

let customRateRuleIds = [];

Meteor.methods({
  async '_e2e.resetAll'() {
    await Meteor.users.removeAsync({});
    await clearSentEmails();

    customRateRuleIds.forEach((id) => DDPRateLimiter.removeRule(id));
    customRateRuleIds = [];

    Accounts._options = Accounts._options || {};
    Accounts._options.forbidClientAccountCreation = false;
    Accounts._options.restrictCreationByEmailDomain = undefined;
    Accounts._options.ambiguousErrorMessages = false;
    Accounts._options.sendVerificationEmail = false;

    resetHooks();

    return true;
  },

  async '_e2e.applyConfig'(options) {
    check(options, Object);
    const { hooks, ...configOptions } = options;
    if (Object.keys(configOptions).length > 0) {
      Accounts.config(configOptions);
    }
    if (hooks) {
      applyHooks(hooks);
    }
    return true;
  },

  async '_e2e.setRateLimit'({ attempts, intervalSec, methodName }) {
    check(attempts, Number);
    check(intervalSec, Number);
    check(methodName, Match.Optional(String));
    const id = DDPRateLimiter.addRule(
      {
        type: 'method',
        name: methodName || 'login',
      },
      attempts,
      intervalSec * 1000,
    );
    customRateRuleIds.push(id);
    return id;
  },
});
