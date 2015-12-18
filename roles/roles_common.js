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
 *    - name
 *
 * Children list elements are subdocuments so that they can easier be extended in the future.
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

  /*
   * Deprecated. Not used anymore.
   */
  GLOBAL_GROUP: null,

  /**
   * Check if user has specified roles.
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
   *                             roles to check against. If array,
   *                             will return true if user is in _any_ role.
   *                             Roles do not have to exist.
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
   *                             Roles do not have to exist.
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
  },

  _checkRoleName: function (roleName) {
    if (!roleName || !_.isString(roleName) || roleName.trim() !== roleName) {
      throw new Error("Invalid role name '" + roleName + "'.");
    }
  }

});  // end _.extend(Roles ...)

}());
