import { Accounts } from 'meteor/accounts-base'
import { RolesCollection, RoleAssignmentCollection } from './roles_common_async'
import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'

const indexFnAssignment = RoleAssignmentCollection.createIndexAsync.bind(RoleAssignmentCollection)
const indexFnRoles = RolesCollection.createIndexAsync.bind(RolesCollection)

const indexes = [
  { 'user._id': 1, 'inheritedRoles._id': 1, scope: 1 },
  { 'user._id': 1, 'role._id': 1, scope: 1 },
  { 'role._id': 1 },
  { scope: 1, 'user._id': 1, 'inheritedRoles._id': 1 }, // Adding userId and roleId might speed up other queries depending on the first index
  { 'inheritedRoles._id': 1 },
]
for (const index of indexes) {
  indexFnAssignment(index)
}
indexFnRoles({ 'children._id': 1 })

const VALID_CONFIG_KEYS = ['adminRole', 'addFirstUserAsAdmin']

let settings = Meteor.settings?.packages?.roles;
let bootstrapReady;

// Server-only state survives account deletion and is never published to clients.
export const FirstUserAdminCollection = new Mongo.Collection('meteor_roles_bootstrap', {
  _preventAutopublish: true,
  defineMutationMethods: false,
});

async function initializeFirstUserAdmin() {
  const existingUser = await Accounts.users.findOneAsync({}, { fields: { _id: 1 } });
  await FirstUserAdminCollection.upsertAsync('first-user-admin', {
    $setOnInsert: { userId: existingUser?._id ?? null },
  });
}

Object.assign(Roles, {
  /**
   * @summary Set configuration for the roles package.
   * @locus Server
   * @param options.adminRole {String} Name for the default admin role that gets created on startup.
   * @param options.addFirstUserAsAdmin {Boolean} If true, the first user created will be added to the admin role.
   * @returns {Promise<void>}
   */
  config: async (options) => {
    for (const key of Object.keys(options)) {
      if (!VALID_CONFIG_KEYS.includes(key)) {
        console.error(`Roles config: Invalid key: ${key}`)
      }
    }

    if (options.adminRole) {
      try {
        await Roles.createRoleAsync(options.adminRole, { unlessExists: true })
      } catch (e) {
        throw new Meteor.Error(500, `Error creating super admin role: ${e.message}`)
      }
    }

    if (options.addFirstUserAsAdmin && options.adminRole) {
      bootstrapReady = initializeFirstUserAdmin();
      await bootstrapReady;
    }
    settings = { ...options };
  }
})

Meteor.startup(async () => {
  if (settings) await Roles.config(settings);
});

Accounts.afterCreateUserHook.register(async user => {
  const config = settings;
  if (config?.addFirstUserAsAdmin && config.adminRole) {
    await bootstrapReady;
    // Only one concurrent signup can change the durable claim from null.
    // Never clear the claim after deletion or assignment failure.
    const claimed = await FirstUserAdminCollection.updateAsync(
      { _id: 'first-user-admin', userId: null },
      { $set: { userId: user._id } },
    );
    if (claimed) {
      try {
        await Roles.addUsersToRolesAsync(user._id, config.adminRole);
      } catch (error) {
        throw new Meteor.Error(500, `Error adding first user to super admin role: ${error.message}`);
      }
    }
  }
});
