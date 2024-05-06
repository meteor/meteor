import { Meteor } from 'meteor/meteor'
import { RolesCollection, RoleAssignmentCollection } from './roles_common_async'

const indexFnAssignment = RoleAssignmentCollection.createIndexAsync.bind(RoleAssignmentCollection)
const indexFnRoles = RolesCollection.createIndexAsync.bind(RolesCollection)

const indexes = [
  { 'user._id': 1, 'inheritedRoles._id': 1, scope: 1 },
  { 'user._id': 1, 'role._id': 1, scope: 1 },
  { 'role._id': 1 },
  { scope: 1, 'user._id': 1, 'inheritedRoles._id': 1 }, // Adding userId and roleId might speed up other queries depending on the first index
  { 'inheritedRoles._id': 1 }
]
indexes.forEach(index => indexFnAssignment(index))
indexFnRoles({ 'children._id': 1 })

/*
 * Publish logged-in user's roles so client-side checks can work.
 *
 * Use a named publish function so clients can check `ready()` state.
 */
Meteor.publish('_roles', function () {
  const loggedInUserId = this.userId
  const fields = { roles: 1 }

  if (!loggedInUserId) {
    this.ready()
    return
  }

  return Meteor.users.find(
    { _id: loggedInUserId },
    { fields }
  )
})
