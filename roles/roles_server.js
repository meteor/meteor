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
for (const index of indexes) {
  indexFnAssignment(index)
}
indexFnRoles({ 'children._id': 1 })
