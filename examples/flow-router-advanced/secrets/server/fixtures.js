"use strict";


////////////////////////////////////////////////////////////////////
// Startup Fixtures for Secrets
//

Meteor.startup(function () {

  createSecrets()

});


function createSecrets () {
  var secrets

  if (Meteor.secrets.find().fetch().length === 0) {
    console.log('Creating secrets: ');

    secrets = [
      {secret:"ec2 password: apple2"},
      {secret:"domain registration pw: apple3"}
    ]

    secrets.forEach(function (secret) {
      console.log(secret)

      Meteor.secrets.insert(secret);
    })
  }
}
