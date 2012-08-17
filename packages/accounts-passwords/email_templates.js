Meteor.accounts.emailTemplates = {
  from: "Meteor Accounts <no-reply@meteor.com>",

  resetPassword: {
    subject: function(user) {
      return "How to reset your password on " + Meteor.absoluteUrl();
    },
    text: function(user, url) {
      var greeting = user.name ? ("Hello " + user.name + ",") : "Hello,";
      return greeting + "\n"
        + "\n"
        + "To reset your password, simply click the link below.\n"
        + "\n"
        + url + "\n"
        + "\n"
        + "Thanks.\n";
    }
  },
  validateEmail: {
    subject: function(user) {
      return "How to validate your account email on " + Meteor.absoluteUrl();
    },
    text: function(user, url) {
      var greeting = user.name ? ("Hello " + user.name + ",") : "Hello,";
      return greeting + "\n"
        + "\n"
        + "To validate your account email, simply click the link below.\n"
        + "\n"
        + url + "\n"
        + "\n"
        + "Thanks.\n";
    }
  },
  enrollAccount: {
    subject: function(user) {
      return "An account has been created for you on " + Meteor.absoluteUrl();
    },
    text: function(user, url) {
      var greeting = user.name ? ("Hello " + user.name + ",") : "Hello,";
      return greeting + "\n"
        + "\n"
        + "To start using the service, simply click the link below.\n"
        + "\n"
        + url + "\n"
        + "\n"
        + "Thanks.\n";
    }
  }
};
