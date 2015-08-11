Template.mainLayout.helpers({
  notVerified: function () { 
    var user = Meteor.user()

    return !emailVerified(user)
  }
})

function emailVerified (user) {
  return _.some(user.emails, function (email) {
    return email.verified
  })
}
