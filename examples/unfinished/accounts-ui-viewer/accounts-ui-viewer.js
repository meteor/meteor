
Meteor.users.allow({ update: () => true });

const { ServiceConfiguration } = Package['service-configuration'];

Meteor.methods({
  'removeService': service => ServiceConfiguration.configurations.remove({ service }),
})

if (Meteor.isClient) {

  Accounts.STASH = { ...Accounts };
  Accounts.STASH.loggingIn = Meteor.loggingIn;

  const handleSetting = (key, value) => {
    if (key === "numServices") {
      const registeredServices = Accounts.oauth.serviceNames();
      ['facebook', 'github', 'google'].forEach((serv, i) => {
        if (i < value && !registeredServices.includes(serv)) {
          Accounts.oauth.registerService(serv);
        } else if (i >= value && registeredServices.includes(serv)) {
          Accounts.oauth.unregisterService(serv);
        }
      });
    } else if (key === "hasPasswords") {
      Package['accounts-password'] = value ? {} : null;
      const user = Meteor.user();
      if (user) {
        if (! value) {
          // make sure we have no username if "app" has no passwords
          Meteor.users.update(Meteor.userId(),
                              { $unset: { username: 1 }});
        } else {
          // make sure we have a username
          Meteor.users.update(Meteor.userId(),
                              { $set: { username: Random.id() }});
        }
      }
    } else if (key === "signupFields") {
      Accounts.ui._options.passwordSignupFields = value;
    } else if (key === "fakeLoggingIn") {
      Meteor.loggingIn = (value ? () => true :
                          Accounts.STASH.loggingIn);
    }
  };

  const settings = Session.get('settings');
  if (! settings) {
    Session.set('settings', {
      alignRight: false,
      positioning: "relative",
      numServices: 3,
      hasPasswords: true,
      signupFields: 'EMAIL_ONLY',
      fakeLoggingIn: false,
      bgcolor: 'white'
    });
  } else {
    Object.keys(settings).forEach(key => handleSetting(key, settings[key]));
  }

  Template.page.helpers({
    settings: () => Session.get('settings'),
    settingsClass: () => {
      var settings = Session.get('settings');
      var classes = [];
      if (settings.positioning)
        classes.push('positioning-' + settings.positioning.toLowerCase());
      return classes.join(' ');
    },
    match: kv => {
      kv = keyValueFromId(kv);
      if (! kv)
        return false;
  
      return Session.get('settings')[kv[0]] === kv[1];
    },
    dropdownAlign: function() {
      var settings = this;
      return settings.alignRight ? 'right' : 'left';
    }
  });


  var keyValueFromId = function (id) {
    var match;
    if (id && (match = /^(.*?):(.*)$/.exec(id))) {
      var key = match[1];
      var value = castValue(match[2]);
      return [key, value];
    }
    return null;
  };

  const castValue = value => {
    if (value === "false")
      value = false;
    else if (value === "true")
      value = true;
    else if (/^[0-9]+$/.test(value))
      value = Number(value);
    return value;
  };

  Template.radio.helpers({
      maybeChecked: function() {
      var curValue = Session.get('settings')[this.key];
      if (castValue(this.value) === curValue)
        return 'checked';
      return '';
    },
  });

  const fakeLogin = callback => {
    Accounts.createUser(
      {username: Random.id(),
       password: "password",
       profile: { name: "Joe Schmoe" }},
      () => {
        var user = Meteor.user();
        if (! user)
          return;
        // delete our username if we are in a mode
        // where there aren't usernames/emails/passwords
        // (only third-party auth) so that there is no
        // "Change Password" button when signed in
        if (! Session.get('settings').hasPasswords)
          Meteor.users.update(Meteor.userId(),
                              { $unset: { username: 1 }});
        callback();
      });
  };

  const exitFlows = () => {
    Accounts._loginButtonsSession.set('inSignupFlow', false);
    Accounts._loginButtonsSession.set('inForgotPasswordFlow', false);
    Accounts._loginButtonsSession.set('inChangePasswordFlow', false);
    Accounts._loginButtonsSession.set('inMessageOnlyFlow', false);
  };

  Template.page.events({
    'change #controlpane input[type=radio]': event => {
      const input = event.currentTarget;
      let keyValue;
      if (input && input.id && (keyValue = keyValueFromId(input.id))) {
        const key = keyValue[0];
        const value = keyValue[1];
        if (value === "false")
          value = false;
        else if (value === "true")
          value = true;
        const settings = Session.get('settings');
        settings[key] = value;
        Session.set('settings', settings);

        handleSetting(key, value);
      }
    },
    'click #controlpane button': function (event) {
      const { ServiceConfiguration } = Package['service-configuration'];
      if (this.key === "fakeConfig") {
        const service = this.value;
        if (! ServiceConfiguration.configurations.findOne({ service }))
          ServiceConfiguration.configurations.insert(
            { service, fake: true });
      } else if (this.key === "unconfig") {
        const service = this.value;
        Meteor.call('removeService', service);
      } else if (this.key === "messages") {
        if (this.value === "error") {
          Accounts._loginButtonsSession.errorMessage('An error occurred!  Gee golly gosh.');
        } else if (this.value === "info") {
          Accounts._loginButtonsSession.infoMessage('Here is some information that is crucial.');
        } else if (this.value === "clear") {
          Accounts._loginButtonsSession.resetMessages();
        }
      } else if (this.key === "sign") {
        if (this.value === 'in') {
          // create a random new user
          fakeLogin(function () {
            Accounts._loginButtonsSession.closeDropdown();
          });
        } else if (this.value === 'out') {
          Meteor.logout();
        }
      } else if (this.key === "showConfig") {
        Accounts._loginButtonsSession.configureService(this.value);
      } else if (this.key === "lov") {
        exitFlows();
        Accounts._loginButtonsSession.set("dropdownVisible", true);
        if (Meteor.userId())
          Meteor.logout();
        if (this.value === "createAccount")
          Accounts._loginButtonsSession.set("inSignupFlow", true);
        else if (this.value === "forgotPassword")
          Accounts._loginButtonsSession.set("inForgotPasswordFlow", true);
      } else if (this.key === "liv") {
        exitFlows();
        Accounts._loginButtonsSession.set("dropdownVisible", true);
        if (! Meteor.userId())
          fakeLogin(() => {});
        if (this.value === "changePassword")
          Accounts._loginButtonsSession.set("inChangePasswordFlow", true);
        else if (this.value === "messageOnly")
          Accounts._loginButtonsSession.set("inMessageOnlyFlow", true);
      } else if (this.key === "modals") {
        const { value } = this;
        [
          'resetPasswordToken',
          'enrollAccountToken',
          'justVerifiedEmail'
        ].forEach(k => {
          Accounts._loginButtonsSession.set(
            k, k.indexOf(value) >= 0 ? 'foo' : null
          );
        });
      }
    }
  });

}
