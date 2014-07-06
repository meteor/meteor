
// Change profile. Must be logged in.
// @param profile obj
// @param callback {Function(error|undefined)
Accounts.changeProfile = function(profile, callback){
  if (!Meteor.user()) {
    callback && callback(new Error( _$("Must be logged in to change password.") ));
    return;
  }

  Accounts.connection.apply('changeProfile', [profile], function(error, result){
      if(error)callback&&callback(error);
      callback&&callback(error);
  });
}

