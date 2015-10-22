Template.manageUsers.onCreated(function () {
  this.subscribe("users")
})

Template.userList.helpers({
  users: function () {
    return Meteor.users.find()
  },
  email: function () {
    return this.emails[0].address
  },
  roles: function () {
    if (!this.roles) {
      return '<none>'
    }

    return this.roles.join(',')
  }
})
