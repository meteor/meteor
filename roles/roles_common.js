;(function () {

/**
 * Provides functions related to user authorization. Compatible with built-in Meteor accounts packages.
 *
 * It uses `roles` field to `Meteor.users` documents which is an array of subdocuments with the following
 * schema:
 *  - role (role name)
 *  - partition (partition name)
 *  - assigned (boolean, if the role was manually assigned, or was automatically inferred (like subroles))
 *
 * @module Roles
 */

/**
 * Roles collection documents consist of:
 *  - _id
 *  - name (of the role)
 *  - children (roles), list of documents:
 *    - _id
 *  - descendants (roles), list of documents (recursively flattened children):
 *    - _id
 *    - name
 *
 * List elements are documents so that they can easier be extended in the future.
 *
 * Example: { _id: "123", name: "admin" }
 */
 if (!Meteor.roles) {
  Meteor.roles = new Mongo.Collection("roles")
}

/**
 * Authorization package compatible with built-in Meteor accounts system.
 *
 * Stores user's current roles in a 'roles' field on the user object.
 *
 * @class Roles
 * @constructor
 */
if ('undefined' === typeof Roles) {
  Roles = {}
}

"use strict";

var getGroupsForUserDeprecationWarning = false;

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

    if (!role || !_.isString(role) || role.trim() !== role) {
      throw new Error("Invalid role name.");
    }

    options = _.defaults(options, {
      unlessExists: false
    });

    try {
      return Meteor.roles.insert({name: role, children: [], descendants: []});
    } catch (e) {
      // (from Meteor accounts-base package, insertUserDoc func)
      // XXX string parsing sucks, maybe
      // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
      if (e.name !== 'MongoError') throw e;
      match = e.err.match(/E11000 duplicate key error index: ([^ ]+)/);
      if (!match) throw e;
      if (match[1].indexOf('$name') !== -1) {
        if (options.unlessExists) return null;
        throw new Error("Role already exists.");
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
    if (!role) return;

    var foundExistingUser = Meteor.users.findOne(
                              {'roles.role': role},
                              {fields: {_id: 1}});

    if (foundExistingUser) {
      throw new Error("Role in use.");
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
   * @param {Array|String} roles Name(s) of roles/permissions to add users to.
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

    _.each(users, function (user) {
      _.each(roles, function (role) {
        Roles._addUserToRole(user, role, options);
      });
    });
  },

  /**
   * Set a users roles/permissions.
   *
   * @example
   *     Roles.setUserRoles(userId, 'admin')
   *     Roles.setUserRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.setUserRoles([user1, user2], ['user','editor'])
   *     Roles.setUserRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *
   * @method setUserRoles
   * @param {Array|String} users User id(s) or object(s) with an _id field.
   * @param {Array|String} roles Name(s) of roles/permissions to add users to.
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

    _.each(users, function (user) {
      if (_.isObject(user)) {
        id = user._id;
      }
      else {
        id = user;
      }
      // we first clear all roles for the user
      Meteor.users.update(id, {$set: {roles: []}});

      // and then add all
      _.each(roles, function (role) {
        Roles._addUserToRole(user, role, options);
      });
    });
  },

  _addUserToRole: function (user, role, options) {

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
   * @param {Array|String} roles Name(s) of roles to add users to.
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

    _.each(users, function (user) {
      _.each(roles, function (role) {
        Roles._removeUserFromRole(user, role, options);
      });
    });
  },

  _removeUserFromRole: function (user, role, options) {

  },

  /**
   * Check if user has specified permissions/roles.
   *
   * @example
   *     // global roles
   *     Roles.userIsInRole(user, 'admin')
   *     Roles.userIsInRole(user, ['admin','editor'])
   *     Roles.userIsInRole(userId, 'admin')
   *     Roles.userIsInRole(userId, ['admin','editor'])
   *
   *     // partition roles (global roles are still checked)
   *     Roles.userIsInRole(user, 'admin', 'group1')
   *     Roles.userIsInRole(userId, ['admin','editor'], 'group1')
   *     Roles.userIsInRole(userId, ['admin','editor'], {partition: 'group1'})
   *
   * Options:
   *   - partition: name of the partition
   *
   * @method userIsInRole
   * @param {String|Object} user User Id or actual user object.
   * @param {String|Array} roles Name of role/permission or Array of
   *                             roles/permissions to check against. If array,
   *                             will return true if user is in _any_ role.
   * @param {String|Object} [options] Optional. Name of partition. If supplied, limits check
   *                                  to just that partition.
   *                                  The user's global roles will always be checked
   *                                  whether partition is specified or not.
   *                                  Alternatively, options.
   * @return {Boolean} true if user is in _any_ of the target roles
   */
  userIsInRole: function (user, roles, options) {
    var id,
        query;

    options = options || {};

    // ensure array to simplify code
    if (!_.isArray(roles)) roles = [roles];

    if (!roles.length) return false;

    if (_.isString(options)) {
      options = {partition: options};
    }

    options.partition = options.partition || null;

    if (!user) return false;

    if (_.isObject(user)) {
      if (_.has(user, 'roles')) {
        return _.some(roles, function (role) {
          return _.some(user.roles || [], Roles._roleAndPartitionMatcher(role, options.partition));
        })
      } else {
        // missing roles field, try going direct via id
        id = user._id;
      }
    } else {
      id = user;
    }

    if (!id) return false;

    query = {
      _id: id,
      $or: [{
        roles: {
          $elemMatch: {
            role: {$in: roles},
            partition: options.partition
          }
        }
      }, {
        roles: {
          $elemMatch: {
            role: {$in: roles},
            partition: null
          }
        }
      }]
    };

    return !!Meteor.users.findOne(query, {fields: {_id: 1}});
  },

  /**
   * Retrieve user's roles.
   *
   * Options:
   *   - partition: name of the partition
   *   - fullObjects: return full roles objects (true) or just names (false) (default false)
   *   - onlyAssigned: return only assigned roles and not automatically inferred (like subroles)
   *
   * @method getRolesForUser
   * @param {String|Object} user User Id or actual user object.
   * @param {String|Object} [options] Optional. Name of partition to provide roles for.
   *                                  If not specified, global roles are returned.
   *                                  Alternatively, options.
   * @return {Array} Array of user's roles, unsorted.
   */
  getRolesForUser: function (user, options) {
    var roles;

    options = options || {};

    if (_.isString(options)) {
      options = {partition: options};
    }

    options.partition = options.partition || null;

    options = _.defaults(options, {
      fullObjects: false,
      onlyAssigned: false
    });

    user = Roles._resolveUser(user);

    if (!user) return [];

    roles = _.filter(user.roles || [], Roles._partitionMatcher(options.partition));

    if (options.onlyAssigned) {
      roles = _.filter(roles, Roles._onlyAssignedMatcher());
    }

    if (options.fullObjects) {
      return roles;
    }

    return _.pluck(roles, 'role');
  },

  /**
   * Retrieve set of all existing roles.
   *
   * @method getAllRoles
   * @param {Object} [queryOptions] Optional. Options which are passed directly
   *                                through to `Meteor.roles.find(query, options)`.
   * @return {Cursor} cursor of existing roles
   */
  getAllRoles: function (queryOptions) {
    queryOptions = queryOptions || {sort: {name: 1}};

    return Meteor.roles.find({}, queryOptions);
  },

  /**
   * Retrieve all users who are in target role.
   *
   * Options:
   *   - partition: name of the partition
   *   - queryOptions: options which are passed directly
   *                   through to `Meteor.users.find(query, options)`
   *
   * @method getUsersInRole
   * @param {Array|String} roles Name of role/permission. If array, users
   *                             returned will have at least one of the roles
   *                             specified but need not have _all_ roles.
   * @param {String|Object} [options] Optional. Name of partition to restrict roles to.
   *                                  User's global roles will also be checked.
   *                                  Alternatively, options.
   * @param {Object} [queryOptions] Optional. Options which are passed directly
   *                                through to `Meteor.users.find(query, options)`
   * @return {Cursor} cursor of users in role
   */
  getUsersInRole: function (roles, options, queryOptions) {
    var query;

    options = options || {};

    // ensure array to simplify code
    if (!_.isArray(roles)) roles = [roles];

    if (_.isString(options)) {
      options = {partition: options};
    }

    options.partition = options.partition || null;

    options = _.defaults(options, {
      queryOptions: queryOptions || {}
    });

    query = {
      $or: [{
        roles: {
          $elemMatch: {
            role: {$in: roles},
            partition: options.partition
          }
        }
      }, {
        roles: {
          $elemMatch: {
            role: {$in: roles},
            partition: null
          }
        }
      }]
    };

    return Meteor.users.find(query, options.queryOptions);
  },

  getGroupsForUser: function (/*args*/) {
    if (!getGroupsForUserDeprecationWarning) {
      getGroupsForUserDeprecationWarning = true;
      console && console.warn("getGroupsForUser has been deprecated. Use getPartitionsForUser instead.");
    }

    return Roles.getPartitionsForUser.apply(this, arguments);
  },

  /**
   * Retrieve users partitions, if any.
   *
   * @method getPartitionsForUser
   * @param {String|Object} user User Id or actual user object.
   * @param {String} [roles] Optional name of roles to restrict partitions to.
   *
   * @return {Array} Array of user's partitions, unsorted.
   */
  getPartitionsForUser: function (user, roles) {
    var partitions;

    // ensure array to simplify code
    if (roles && !_.isArray(roles)) roles = [roles];

    user = Roles._resolveUser(user);

    if (!user) return [];

    partitions = [];
    _.each(user.roles || [], function (userRole) {
      // == used on purpose.
      if (userRole.partition == null) return;
      if (roles && !_.contains(roles, userRole.role)) return;

      partitions.push(userRole.partition);
    });

    return _.uniq(partitions);
  },

  _resolveUser: function (user) {
    // TODO: We could use $elemMatch to limit returned fields here.
    if (!_.isObject(user)) {
      user = Meteor.users.findOne(
               {_id: user},
               {fields: {roles: 1}});
    } else if (!_.has(user, 'roles')) {
      user = Meteor.users.findOne(
               {_id: user._id},
               {fields: {roles: 1}});
    }

    return user;
  },

  _roleAndPartitionMatcher: function (roleName, partition) {
    return function (userRole) {
      // == used on purpose in "userRole.partition == null"
      return (userRole.role === roleName && userRole.partition === partition) ||
        (userRole.role === roleName && (!_.has(userRole, 'partition') || userRole.partition == null));
    };
  },

  _partitionMatcher: function (partition) {
    return function (userRole) {
      // == used on purpose in "userRole.partition == null"
      return (userRole.partition === partition) ||
        (!_.has(userRole, 'partition') || userRole.partition == null);
    };
  },

  _onlyAssignedMatcher: function () {
    return function (userRole) {
      return !!userRole.assigned;
    };
  }

});  // end _.extend(Roles ...)

}());
