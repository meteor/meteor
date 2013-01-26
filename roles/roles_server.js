;(function () {


/**
 * Roles collection documents consist only of an id and a role name.
 *   ex: { _id:<uuid>, name: "admin" }
 */
if (!Meteor.roles) {
  Meteor.roles = new Meteor.Collection("roles")
}


// Create default indexes for roles collection
Meteor.roles._ensureIndex('name', {unique: 1});

}());
