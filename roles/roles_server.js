;(function () {

/**
 * Eliminate Meteor.Collection deprecation warning while maintaining
 * backwards compatibility
 */
var Mongo = Mongo || _.pick(Meteor,'Collection');

/**
 * Roles collection documents consist only of an id and a role name.
 *   ex: { _id:<uuid>, name: "admin" }
 */
if (!Meteor.roles) {
  Meteor.roles = new Mongo.Collection("roles")

  // Create default indexes for roles collection
  Meteor.roles._ensureIndex('name', {unique: 1})
}


/**
 * Always publish logged-in user's roles so client-side
 * checks can work.
 */
Meteor.publish(null, function () {
  var userId = this.userId,
      fields = {roles:1}

  return Meteor.users.find({_id:userId}, {fields: fields})
})

}());
