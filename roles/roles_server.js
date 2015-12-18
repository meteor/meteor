"use strict";

// Create default indexes for roles and users collection.

Meteor.roles._ensureIndex({name: 1}, {unique: 1});

// Index only on "roles.role" is not needed because the combined index works for it as well.
Meteor.users._ensureIndex({'roles.role': 1, 'roles.partition': 1});
Meteor.users._ensureIndex({'roles.partition': 1});

/**
 * Publish logged-in user's roles so client-side checks can work.
 * 
 * Use a named publish function so clients can check `ready()` state.
 */
Meteor.publish('_roles', function () {
  var loggedInUserId = this.userId,
      fields = {roles: 1};

  if (!loggedInUserId) {
    this.ready();
    return;
  }

  return Meteor.users.find({_id: loggedInUserId},
                           {fields: fields});
});

_.extend(Roles, {

  /**
   * Create a new role.
   *
   * Options:
   *   - unlessExists: if true, existence of a role will not throw an exception
   *
   * @method createRole
   * @param {String} role Name of role.
   * @param {Object} [options] Optional.
   * @return {String} id of new role
   */
  createRole: function (role, options) {
    var match;

    options = options || {};

    Roles._checkRoleName(role);

    options = _.defaults(options, {
      unlessExists: false
    });

    try {
      return Meteor.roles.insert({name: role, children: []});
    } catch (e) {
      // (from Meteor accounts-base package, insertUserDoc func)
      // XXX string parsing sucks, maybe
      // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
      if (e.name !== 'MongoError') throw e;
      match = e.err.match(/E11000 duplicate key error index: ([^ ]+)/);
      if (!match) throw e;
      if (match[1].indexOf('$name') !== -1) {
        if (options.unlessExists) return null;
        throw new Error("Role '" + role + "' already exists.");
      }
      throw e;
    }
  },

  /**
   * Delete an existing role. Will throw "Role in use." error if any users
   * are currently assigned to the target role.
   *
   * @method deleteRole
   * @param {String} role Name of role
   */
  deleteRole: function (role) {
    Roles._checkRoleName(role);

    var foundExistingUser = Meteor.users.findOne(
                              {'roles.role': role},
                              {fields: {_id: 1}});

    if (foundExistingUser) {
      throw new Error("Role '" + role + "' in use.");
    }

    Meteor.roles.remove({name: role});
  },

  /**
   * Add users to roles.
   *
   * @example
   *     Roles.addUsersToRoles(userId, 'admin')
   *     Roles.addUsersToRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.addUsersToRoles([user1, user2], ['user','editor'])
   *     Roles.addUsersToRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *
   * Options:
   *   - partition: name of the partition
   *
   * @method addUsersToRoles
   * @param {Array|String} users User id(s) or object(s) with an _id field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles have to exist.
   * @param {String|Object} [options] Optional. Name of partition. Alternatively, options.
   */
  addUsersToRoles: function (users, roles, options) {
    if (!users) throw new Error ("Missing 'users' param.");
    if (!roles) throw new Error ("Missing 'roles' param.");

    options = options || {};

    // ensure arrays
    if (!_.isArray(users)) users = [users];
    if (!_.isArray(roles)) roles = [roles];

    if (_.isString(options)) {
      options = {partition: options};
    }

    options.partition = options.partition || null;

    options = _.defaults(options, {
      _assigned: true
    });

    _.each(users, function (user) {
      _.each(roles, function (role) {
        Roles._addUserToRole(user, role, options);
      });
    });
  },

  /**
   * Set users' roles.
   *
   * @example
   *     Roles.setUserRoles(userId, 'admin')
   *     Roles.setUserRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.setUserRoles([user1, user2], ['user','editor'])
   *     Roles.setUserRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *
   * @method setUserRoles
   * @param {Array|String} users User id(s) or object(s) with an _id field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles have to exist.
   * @param {String|Object} [options] Optional. Name of partition. Alternatively, options.
   */
  setUserRoles: function (users, roles, options) {
    var id;

    if (!users) throw new Error ("Missing 'users' param.");
    if (!roles) throw new Error ("Missing 'roles' param.");

    options = options || {};

    // ensure arrays
    if (!_.isArray(users)) users = [users];
    if (!_.isArray(roles)) roles = [roles];

    if (_.isString(options)) {
      options = {partition: options};
    }

    options.partition = options.partition || null;

    options = _.defaults(options, {
      _assigned: true
    });

    _.each(users, function (user) {
      if (_.isObject(user)) {
        id = user._id;
      }
      else {
        id = user;
      }
      // we first clear all roles for the user
      Meteor.users.update(id, {$pull: {roles: {partition: options.partition}}});

      // and then add all
      _.each(roles, function (role) {
        Roles._addUserToRole(user, role, options);
      });
    });
  },

  _addUserToRole: function (user, roleName, options) {
    var id,
        role,
        count;

    Roles._checkRoleName(roleName);

    if (_.isObject(user)) {
      id = user._id;
    }
    else {
      id = user;
    }

    if (!id) return;

    role = Meteor.roles.findOne({name: roleName}, {fields: {children: 1}});

    if (!role) {
      throw new Error("Role '" + roleName + "' does not exist.");
    }

    // add new role if it is not already added
    count = Meteor.users.update({
      _id: id,
      roles: {
        $not: {
          $elemMatch: {
            role: roleName,
            partition: options.partition
          }
        }
      }

    }, {
      $addToSet: {
        roles: {
          role: roleName,
          partition: options.partition,
          assigned: options._assigned
        }
      }
    });

    if (options._assigned && !count) {
      // a role has not been added, it maybe already exists,
      // let's make sure it is set as assigned
      Meteor.users.update({
        _id: id,
        roles: {
          $elemMatch: {
            role: roleName,
            partition: options.partition
          }
        }

      }, {
        $set: {
          'roles.$.assigned': true
        }
      });
    }

    _.each(role.children, function (child) {
      Roles._addUserToRole(user, child.name, _.extend({}, options, {_assigned: false}));
    });
  },

  /**
   * Remove users from roles.
   *
   * @example
   *     Roles.removeUsersFromRoles(userId, 'admin')
   *     Roles.removeUsersFromRoles([userId, user2], ['editor'])
   *     Roles.removeUsersFromRoles(userId, ['user'], 'group1')
   *
   * @method removeUsersFromRoles
   * @param {Array|String} users User id(s) or object(s) with an _id field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles do not have to exist.
   * @param {String|Object} [options] Optional. Name of partition. Alternatively, options.
   */
  removeUsersFromRoles: function (users, roles, options) {
    if (!users) throw new Error ("Missing 'users' param.");
    if (!roles) throw new Error ("Missing 'roles' param.");

    options = options || {};

    // ensure arrays
    if (!_.isArray(users)) users = [users];
    if (!_.isArray(roles)) roles = [roles];

    if (_.isString(options)) {
      options = {partition: options};
    }

    options.partition = options.partition || null;

    options = _.defaults(options, {
      _onlyAssigned: true
    });

    _.each(users, function (user) {
      _.each(roles, function (role) {
        Roles._removeUserFromRole(user, role, options);
      });
    });
  },

  _removeUserFromRole: function (user, roleName, options) {
    var id,
        role,
        update;

    Roles._checkRoleName(roleName);

    if (_.isObject(user)) {
      id = user._id;
    }
    else {
      id = user;
    }

    if (!id) return;

    update = {
      $pull: {
        roles: {
          role: roleName,
          partition: options.partition
        }
      }
    };

    if (options._onlyAssigned) {
      update.$pull.roles.assigned = true;
    }

    // we try to remove the role in every case, whether the role really exists or not
    Meteor.users.update(id, update);

    role = Meteor.roles.findOne({name: roleName}, {fields: {children: 1}});

    // role does not exist, we do not anything more
    if (!role) return;

    _.each(role.children, function (child) {
      // if a child role has been assigned explicitly, we do not remove it
      Roles._removeUserFromRole(user, child.name, _.extend({}, options, {_onlyAssigned: true}));
    });
  },

  _forwardMigrate: function () {

  },

  _backwardMigrate: function () {

  }

});  // end _.extend(Roles ...)
