;(function () {

/**
 * Provides functions related to user authorization. Compatible with built-in Meteor accounts packages.
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
   * Create a new role. Whitespace will be trimmed.
   *
   * @method createRole
   * @param {String} role Name of role
   * @param {Boolean} [unlessExists] Optional. If true, existence of a role will not throw an exception.
   * @return {String} id of new role
   */
  createRole: function (role, unlessExists) {
    var id,
        match

    if (!role
        || 'string' !== typeof role
        || role.trim().length === 0) {
      return
    }

    try {
      id = Meteor.roles.insert({'name': role.trim()})
      return id
    } catch (e) {
      // (from Meteor accounts-base package, insertUserDoc func)
      // XXX string parsing sucks, maybe
      // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
      if (e.name !== 'MongoError') throw e
      match = e.err.match(/E11000 duplicate key error index: ([^ ]+)/)
      if (!match) throw e
      if (match[1].indexOf('$name') !== -1) {
        if (unlessExists) return null
        throw new Meteor.Error(403, "Role already exists.")
      }
      throw e
    }
  },

  /**
   * Delete an existing role.  Will throw "Role in use" error if any users
   * are currently assigned to the target role.
   *
   * @method deleteRole
   * @param {String} role Name of role
   */
  deleteRole: function (role) {
    if (!role) return

    var foundExistingUser = Meteor.users.findOne(
                              {roles: {$in: [role]}},
                              {fields: {_id: 1}})

    if (foundExistingUser) {
      throw new Meteor.Error(403, 'Role in use')
    }

    var thisRole = Meteor.roles.findOne({name: role})
    if (thisRole) {
      Meteor.roles.remove({_id: thisRole._id})
    }
  },

  /**
   * Add users to roles. Will create roles as needed.
   *
   * Makes 2 calls to database:
   *  1. retrieve list of all existing roles
   *  2. update users' roles
   *
   * @example
   *     Roles.addUsersToRoles(userId, 'admin')
   *     Roles.addUsersToRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.addUsersToRoles([user1, user2], ['user','editor'])
   *     Roles.addUsersToRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *     Roles.addUsersToRoles(userId, 'admin', Roles.GLOBAL_GROUP)
   *
   * @method addUsersToRoles
   * @param {Array|String} users User id(s) or object(s) with an _id field
   * @param {Array|String} roles Name(s) of roles/permissions to add users to
   * @param {String} [group] Optional group name. If supplied, roles will be
   *                         specific to that group.  
   *                         Group names can not start with a '$' or contain
   *                         null characters.  Periods in names '.' are
   *                         automatically converted to underscores.
   *                         The special group Roles.GLOBAL_GROUP provides 
   *                         a convenient way to assign blanket roles/permissions
   *                         across all groups.  The roles/permissions in the 
   *                         Roles.GLOBAL_GROUP group will be automatically 
   *                         included in checks for any group.
   */
  addUsersToRoles: function (users, roles, group) {
    // use Template pattern to update user roles
    Roles._updateUserRoles(users, roles, group, Roles._update_$addToSet_fn)
  },

  /**
   * Set a users roles/permissions.
   *
   * @example
   *     Roles.setUserRoles(userId, 'admin')
   *     Roles.setUserRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.setUserRoles([user1, user2], ['user','editor'])
   *     Roles.setUserRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *     Roles.setUserRoles(userId, 'admin', Roles.GLOBAL_GROUP)
   *
   * @method setUserRoles
   * @param {Array|String} users User id(s) or object(s) with an _id field
   * @param {Array|String} roles Name(s) of roles/permissions to add users to
   * @param {String} [group] Optional group name. If supplied, roles will be
   *                         specific to that group.  
   *                         Group names can not start with '$'.
   *                         Periods in names '.' are automatically converted
   *                         to underscores.
   *                         The special group Roles.GLOBAL_GROUP provides 
   *                         a convenient way to assign blanket roles/permissions
   *                         across all groups.  The roles/permissions in the 
   *                         Roles.GLOBAL_GROUP group will be automatically 
   *                         included in checks for any group.
   */
  setUserRoles: function (users, roles, group) {
    // use Template pattern to update user roles
    Roles._updateUserRoles(users, roles, group, Roles._update_$set_fn)
  },

  /**
   * Remove users from roles
   *
   * @example
   *     Roles.removeUsersFromRoles(users.bob, 'admin')
   *     Roles.removeUsersFromRoles([users.bob, users.joe], ['editor'])
   *     Roles.removeUsersFromRoles([users.bob, users.joe], ['editor', 'user'])
   *     Roles.removeUsersFromRoles(users.eve, ['user'], 'group1')
   *
   * @method removeUsersFromRoles
   * @param {Array|String} users User id(s) or object(s) with an _id field
   * @param {Array|String} roles Name(s) of roles to add users to
   * @param {String} [group] Optional. Group name. If supplied, only that
   *                         group will have roles removed.
   */
  removeUsersFromRoles: function (users, roles, group) {
    var update

    if (!users) throw new Error ("Missing 'users' param")
    if (!roles) throw new Error ("Missing 'roles' param")
    if (group) {
      if ('string' !== typeof group)
        throw new Error ("Roles error: Invalid parameter 'group'. Expected 'string' type")
      if ('$' === group[0])
        throw new Error ("Roles error: groups can not start with '$'")

      // convert any periods to underscores
      group = group.replace(/\./g, '_')
    }

    // ensure arrays
    if (!_.isArray(users)) users = [users]
    if (!_.isArray(roles)) roles = [roles]

    // ensure users is an array of user ids
    users = _.reduce(users, function (memo, user) {
      var _id
      if ('string' === typeof user) {
        memo.push(user)
      } else if ('object' === typeof user) {
        _id = user._id
        if ('string' === typeof _id) {
          memo.push(_id)
        }
      }
      return memo
    }, [])

    // update all users, remove from roles set
    
    if (group) {
      update = {$pullAll: {}}
      update.$pullAll['roles.'+group] = roles
    } else {
      update = {$pullAll: {roles: roles}}
    }

    try {
      if (Meteor.isClient) {
        // Iterate over each user to fulfill Meteor's 'one update per ID' policy
        _.each(users, function (user) {
          Meteor.users.update({_id:user}, update)
        })
      } else {
        // On the server we can leverage MongoDB's $in operator for performance
        Meteor.users.update({_id:{$in:users}}, update, {multi: true})
      }
    }
    catch (ex) {
      if (ex.name === 'MongoError' && isMongoMixError(ex.err)) {
        throw new Error (mixingGroupAndNonGroupErrorMsg)
      }

      throw ex
    }
  },

  /**
   * Check if user has specified permissions/roles
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
   * @param {String|Object} user User Id or actual user object
   * @param {String|Array} roles Name of role/permission or Array of 
   *                             roles/permissions to check against.  If array,
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

    // ensure array to simplify code
    if (!_.isArray(roles)) {
      roles = [roles];
    }

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
   * @param {String|Object} user User Id or actual user object
   * @param {String|Object} [options] Optional. Name of partition to provide roles for.
   *                                  If not specified, global roles are returned.
   *                                  Alternatively, options.
   * @return {Array} Array of user's roles, unsorted.
   */
  getRolesForUser: function (user, options) {
    var roles;

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
   *                                through to `Meteor.roles.find(query, options)`
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
   * @param {Array|String} roles Name of role/permission.  If array, users
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

    // ensure array to simplify code
    if (!_.isArray(roles)) {
      roles = [roles];
    }

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
   * @param {String|Object} user User Id or actual user object
   * @param {String} [roles] Optional name of roles to restrict partitions to.
   *
   * @return {Array} Array of user's partitions, unsorted.
   */
  getPartitionsForUser: function (user, roles) {
    // ensure array to simplify code
    if (!_.isArray(roles)) {
      roles = [roles];
    }

    user = Roles._resolveUser(user);

    if (!user) return [];

    // != used on purpose.
    return _.uniq(_.filter(_.pluck(user.roles || [], 'partition'), function (partition) {return partition != null}));
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
