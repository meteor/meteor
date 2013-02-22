;(function () {


/**
 * Roles collection documents consist only of an id and a role name.
 *   ex: { _id:<uuid>, name: "admin" }
 */
if (!Meteor.roles) {
  Meteor.roles = new Meteor.Collection("roles")

  // Create default indexes for roles collection
  Meteor.roles._ensureIndex('name', {unique: 1})
}

Meteor.publish('_roles_own_user_roles', function () {
  var userId = this.userId,
      fields = {roles:1}

  if (!userId) {
    return
  }

  return Meteor.users.find({_id:userId}, {fields: fields})
})

}());
