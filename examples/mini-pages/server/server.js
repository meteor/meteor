;(function () {

  "use strict";


////////////////////////////////////////////////////////////////////
// Patches
//

if (!console || !console.log) {
  // stub for IE
  console = { 
    log: function (msg) {
      $('#log').append(msg)
    } 
  };
}


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

    _.each(users, function (user) {
      var id;
      
      console.log(user);

      id = Accounts.createUser({
        email: user.email,
        password: "apple1",
        profile: { name: user.name }
      });

      Roles.addUsersToRoles(id, user.roles);
    
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

    throw new Meteor.Error(403, "Not authorized to create new users");
  });

});


////////////////////////////////////////////////////////////////////
// Publish
//


// Authorized users can view secrets
Meteor.publish("secrets", function () {
  var user = Meteor.users.findOne({_id:this.userId});

  if (Roles.userIsInRole(user, ["admin","view-secrets"])) {
    return Meteor.secrets.find();
  }

  this.stop();
  return;
});

// Authorized users can manage user accounts
Meteor.publish("users", function () {
  var user = Meteor.users.findOne({_id:this.userId});

  if (Roles.userIsInRole(user, ["admin","manage-users"])) {
    return Meteor.users.find({}, {fields: {emails: 1, profile: 1, roles: 1}});
  } 

  this.stop();
  return;
});

}());
