import { RolesCollection, RoleAssignmentCollection } from './roles_common_async'
import { Meteor } from 'meteor/meteor'

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

const VALID_CONFIG_KEYS = ['adminRole', 'addFirstUserAsAdmin']

Meteor.startup(async () => {
  // Get roles settings from settings file
  const settings = Meteor.settings?.packages?.roles
  if (settings) {
    if (!Meteor.isProduction) {
      // Validate config options keys
      for (const key of Object.keys(settings)) {
        if (!VALID_CONFIG_KEYS.includes(key)) {
          console.error(`Roles config: Invalid key: ${key}`)
        }
      }
    }

    if (settings.adminRole) {
      try {
        await Roles.createRoleAsync(settings.adminRole, { unlessExists: true })
      } catch (e) {
        Meteor.Error(500, `Error creating super admin role: ${e.message}`)
      }
    }
  }
})

Accounts.afterCreateUserHook.register(async user => {
  const settings = Meteor.settings?.packages?.roles
  if (settings?.addFirstUserAsAdmin && settings.adminRole) {
    // Check if this is the first user created
    const count = await Accounts.users.countDocuments({}, { limit: 2 })
    if (count === 1) {
      // Add the first user to the admin role
      try {
        await Roles.addUsersToRolesAsync(user._id, settings.adminRole)
      } catch (e) {
        Meteor.Error(
          500,
          `Error adding first user to super admin role: ${e.message}`,
        );
      }
    }
  }
})
