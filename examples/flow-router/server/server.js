;(function () {

  "use strict";


////////////////////////////////////////////////////////////////////
// Startup
//

Meteor.startup(function () {

  ////////////////////////////////////////////////////////////////////
  // Create Test Secrets
  //

  if (Meteor.secrets.find().fetch().length === 0) {
    Meteor.secrets.insert({secret:"ec2 password: apple2"});
    Meteor.secrets.insert({secret:"domain registration pw: apple3"});
  }


  ////////////////////////////////////////////////////////////////////
  // Create Test Users
  //

  if (Meteor.users.find().fetch().length === 0) {

    console.log('Creating users: ');

    var users = [
        {name:"Normal User",email:"normal@example.com",roles:[]},
        {name:"View-Secrets User",email:"view@example.com",roles:['view-secrets']},
        {name:"Manage-Users User",email:"manage@example.com",roles:['manage-users']},
        {name:"Admin User",email:"admin@example.com",roles:['admin']}
      ];

    users.forEach(function (userData) {
      var id,
          user;

      console.log(userData);

      id = Accounts.createUser({
        email: userData.email,
        password: "apple1",
        profile: { name: userData.name }
      });

      // email verification
      Meteor.users.update({_id: id}, {$set:{'emails.0.verified': true}});

      userData.roles.forEach(function (role) {
        Roles.createRole(role, {unlessExists: true});
      });

      Roles.addUsersToRoles(id, userData.roles);

    });
  }



  ////////////////////////////////////////////////////////////////////
  // Prevent non-authorized users from creating new users
  //

  Accounts.validateNewUser(function (user) {
    var loggedInUser = Meteor.user();

    if (Roles.userIsInRole(loggedInUser, ['admin','manage-users'])) {
      return true;
    }

    throw new Meteor.Error('unauthorized', "Not authorized to create new users");
  });

});


////////////////////////////////////////////////////////////////////
// Publish
//


// Authorized users can view secrets
Meteor.publish("secrets", function () {
  var user = Meteor.users.findOne({_id:this.userId});

  if (Roles.userIsInRole(user, ["admin","view-secrets"])) {
    console.log('publishing secrets', this.userId);
    return Meteor.secrets.find();
  }

  this.stop();
  return;
});

// Authorized users can manage user accounts
Meteor.publish("users", function () {
  var user = Meteor.users.findOne({_id:this.userId});

  if (Roles.userIsInRole(user, ["admin","manage-users"])) {
    console.log('publishing users', this.userId);
    return Meteor.users.find({}, {fields: {emails: 1, profile: 1, roles: 1}});
  }

  this.stop();
  return;
});

}());
