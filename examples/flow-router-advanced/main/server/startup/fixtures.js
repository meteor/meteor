"use strict";


////////////////////////////////////////////////////////////////////
// Startup Fixtures
//

Meteor.startup(function () {

  createUsers()

});


function createUsers () {
  var users

  if (Meteor.users.find().fetch().length === 0) {

    console.log('Creating users: ');

    users = [
      {name:"Normal User",email:"normal@example.com",roles:[]},
      {name:"View-Secrets User",email:"view@example.com",roles:['secrets']},
      {name:"Manage-Users User",email:"manage@example.com",roles:['manage-users']},
      {name:"Admin User",email:"admin@example.com",roles:['admin']}
    ];

    _.each(users, function (userData) {
      var id
      
      console.log(userData);

      id = Accounts.createUser({
        email: userData.email,
        password: "apple1",
        profile: { name: userData.name }
      });

      // email verification
      Meteor.users.update({_id: id},
                          {$set:{'emails.0.verified': true}});

      _.each(userData.roles, function (role) {
        Roles.createRole(role, {unlessExists: true});
      });

      Roles.addUsersToRoles(id, userData.roles);
    
    });
  }
}
