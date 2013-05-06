
Meteor.users.allow({update: function () { return true; }});

if (Meteor.isClient) {

  Accounts.STASH = _.extend({}, Accounts);
  Accounts.STASH.loggingIn = Meteor.loggingIn;

  var handleSetting = function (key, value) {
    if (key === "numServices") {
      _.each(['facebook', 'github', 'google'],
             function (serv, i) {
               if (i < value)
                 Accounts[serv] = Accounts.STASH[serv];
               else
                 Accounts[serv] = null;
             });
    } else if (key === "hasPasswords") {
      Accounts.password = value && Accounts.STASH.password || null;
      var user = Meteor.user();
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
      Meteor.loggingIn = (value ? function () { return true; } :
                          Accounts.STASH.loggingIn);
    }
  };

  if (! Session.get('settings'))
    Session.set('settings', {
      alignRight: false,
      positioning: "relative",
      numServices: 3,
      hasPasswords: true,
      signupFields: 'EMAIL_ONLY',
      fakeLoggingIn: false,
      bgcolor: 'white'
    });
  else
    _.each(Session.get('settings'), function (v,k) {
      handleSetting(k, v);
    });

  Template.page.settings = function () {
    return Session.get('settings');
  };

  Template.page.settingsClass = function () {
    var settings = Session.get('settings');
    var classes = [];
    if (settings.positioning)
      classes.push('positioning-' + settings.positioning.toLowerCase());
    return classes.join(' ');
  };

  var keyValueFromId = function (id) {
    var match;
    if (id && (match = /^(.*?):(.*)$/.exec(id))) {
      var key = match[1];
      var value = castValue(match[2]);
      return [key, value];
    }
    return null;
  };

  var castValue = function (value) {
    if (value === "false")
      value = false;
    else if (value === "true")
      value = true;
    else if (/^[0-9]+$/.test(value))
      value = Number(value);
    return value;
  };

  Template.radio.maybeChecked = function () {
    var curValue = Session.get('settings')[this.key];
    if (castValue(this.value) === curValue)
      return 'checked="checked"';
    return '';
  };

  Template.page.radio = function (key, value, label) {
    return new Handlebars.SafeString(
      Template.radio({key: key, value: value, label: label}));
  };

  Template.page.button = function (key, value, label) {
    return new Handlebars.SafeString(
      Template.button({key: key, value: value, label: label}));
  };

  Template.page.match = function (kv) {
    kv = keyValueFromId(kv);
    if (! kv)
      return false;

    return Session.get('settings')[kv[0]] === kv[1];
  };

  Template.page.dropdownAlign = function () {
    var settings = this;
    return settings.alignRight ? 'right' : 'left';
  };

  var fakeLogin = function (callback) {
    Accounts.createUser(
      {username: Random.id(),
       password: "password",
       profile: { name: "Joe Schmoe" }},
      function () {
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

  var exitFlows = function () {
    Accounts._loginButtonsSession.set('inSignupFlow', false);
    Accounts._loginButtonsSession.set('inForgotPasswordFlow', false);
    Accounts._loginButtonsSession.set('inChangePasswordFlow', false);
    Accounts._loginButtonsSession.set('inMessageOnlyFlow', false);
  };

  Template.page.events({
    'change #controlpane input[type=radio]': function (event) {
      var input = event.currentTarget;
      var keyValue;
      if (input && input.id && (keyValue = keyValueFromId(input.id))) {
        var key = keyValue[0];
        var value = keyValue[1];
        if (value === "false")
          value = false;
        else if (value === "true")
          value = true;
        var settings = Session.get('settings');
        settings[key] = value;
        Session.set('settings', settings);

        handleSetting(key, value);
      }
    },
    'click #controlpane button': function (event) {
      if (this.key === "fakeConfig") {
        var service = this.value;
        if (! ServiceConfiguration.configurations.findOne({service: service}))
          ServiceConfiguration.configurations.insert(
            {service: service, fake: true});
      } else if (this.key === "unconfig") {
        var service = this.value;
        ServiceConfiguration.configurations.remove({service: service});
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
          fakeLogin();
        if (this.value === "changePassword")
          Accounts._loginButtonsSession.set("inChangePasswordFlow", true);
        else if (this.value === "messageOnly")
          Accounts._loginButtonsSession.set("inMessageOnlyFlow", true);
      } else if (this.key === "modals") {
        var value = this.value;
        _.each([
          'resetPasswordToken',
          'enrollAccountToken',
          'justVerifiedEmail'], function (k) {
            Accounts._loginButtonsSession.set(
              k, k.indexOf(value) >= 0 ? 'foo' : null);
          });
      }
    }
  });

}