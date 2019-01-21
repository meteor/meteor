Template.mainLayout.helpers({
  notVerified: function () {
    var user = Meteor.user()

    return !emailVerified(user)
  }
})

function emailVerified (user) {
  return user.emails.some(function (email) {
    return email.verified
  })
}
