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
 * Roles can have multiple parents and can be children (subroles) of multiple roles.
 *
 * Example: { _id: "123", name: "admin" }
 */
 if (!Meteor.roles) {
  Meteor.roles = new Mongo.Collection("roles");
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
  Roles = {};
}

"use strict";

var getGroupsForUserDeprecationWarning = false;

_.extend(Roles, {

  /*
   * Deprecated. Not used anymore.
   */
  GLOBAL_GROUP: null,

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
   * Delete an existing role.
   *
   * @method deleteRole
   * @param {String} role Name of role
   */
  deleteRole: function (role) {
    Roles._checkRoleName(role);

    Meteor.users.update({}, {
      $pull: {
        roles: {
          role: role
        }
      }
    }, {multi: true});

    Meteor.roles.remove({name: role});

    // try once more just to be sure if role was assigned
    // just before the role itself was removed
    Meteor.users.update({}, {
      $pull: {
        roles: {
          role: role
        }
      }
    }, {multi: true});
  },

  addRoleParent: function (roleName, parentName) {
    var role,
        count,
        parentRoles;

    Roles._checkRoleName(roleName);
    Roles._checkRoleName(parentName);

    // query to get role's _id
    role = Meteor.roles.findOne({name: roleName}, {fields: {_id: 1}});

    if (!role) {
      throw new Error("Role '" + roleName + "' does not exist.");
    }

    count = Meteor.roles.update({
      name: parentName,
      'children._id': {
        $ne: role._id
      }
    }, {
      $addToSet: {
        children: {
          _id: role._id,
          name: role.name
        }
      }
    });

    // if there was no change, parent role might not exist, or role is
    // already a subrole; in any case we do not have anything more to do
    if (!count) return;

    Roles.getUsersInRole(parentName, {
      anyPartition: true,
      queryOptions: {
        fields: {
          _id: 1,
          roles: 1
        }
      }
    }).forEach(function (user, index, cursor) {
      // parent role can be assigned multiple times to the user, for multiple partitions
      // we have to assign a new subrole for each of those partitions
      parentRoles = _.filter(user.roles, Roles._roleMatcher(parentName));
      _.each(parentRoles, function (parentRole) {
        Roles._addUserToRole(user, roleName, {partition: parentRole.partition, _assigned: false})
      });
    });
  },

  removeRoleParent: function (roleName, parentName) {
    var role,
        count,
        parentRoles;

    Roles._checkRoleName(roleName);
    Roles._checkRoleName(parentName);

    // to check for role existence
    // (_id would not really be needed, but we are trying to match addRoleParent)
    role = Meteor.roles.findOne({name: roleName}, {fields: {_id: 1}});

    if (!role) {
      throw new Error("Role '" + roleName + "' does not exist.");
    }

    count = Meteor.roles.update({
      name: parentName
    }, {
      $pull: {
        children: {
          _id: role._id
        }
      }
    });

    // if there was no change, parent role might not exist, or role was
    // already not a subrole; in any case we do not have anything more to do
    if (!count) return;

    Roles.getUsersInRole(parentName, {
      anyPartition: true,
      queryOptions: {
        fields: {
          _id: 1,
          roles: 1
        }
      }
    }).forEach(function (user, index, cursor) {
      // parent role can be assigned multiple times to the user, for multiple partitions
      // we have to remove the subrole for each of those partitions
      parentRoles = _.filter(user.roles, Roles._roleMatcher(parentName));
      _.each(parentRoles, function (parentRole) {
        // but we want to remove it only if it was not also explicitly assigned
        Roles._removeUserFromRole(user, roleName, {partition: parentRole.partition, _onlyAssigned: true})
      });
    });

    // now we have an edge case we have to handle
    // because we allow the same role to be a child of multiple roles it might happen
    // that we just removed some subroles which we should not because they are
    // in effect also through some other parent role
    // so we simply reassign to all users the parent role again
    Roles.getUsersInRole(parentName, {
      anyPartition: true,
      queryOptions: {
        fields: {
          _id: 1,
          roles: 1
        }
      }
    }).forEach(function (user, index, cursor) {
      // parent role can be assigned multiple times to the user, for multiple partitions
      // we have to reassign the parent role for each of those partitions
      parentRoles = _.filter(user.roles, Roles._roleMatcher(parentName));
      _.each(parentRoles, function (parentRole) {
        Roles._addUserToRole(user, parentRole.role, {partition: parentRole.partition, _assigned: parentRole.assigned});
      });
    });
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
   *   - anyPartition: if set, role can be in any partition (partition option is ignored)
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

    options = _.defaults(options, {
      anyPartition: false
    });

    if (!user) return false;

    if (_.isObject(user)) {
      if (_.has(user, 'roles')) {
        return _.some(roles, function (role) {
          if (options.anyPartition) {
            return _.some(user.roles || [], Roles._roleMatcher(role));
          }
          else {
            return _.some(user.roles || [], Roles._roleAndPartitionMatcher(role, options.partition));
          }
        })
      } else {
        // missing roles field, try going direct via id
        id = user._id;
      }
    } else {
      id = user;
    }

    if (!id) return false;

    if (options.anyPartition) {
      query = {
        _id: id,
        'roles.role': {$in: roles}
      };
    }
    else {
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
    }

    return !!Meteor.users.findOne(query, {fields: {_id: 1}});
  },

  /**
   * Retrieve user's roles.
   *
   * Options:
   *   - partition: name of the partition
   *   - anyPartition: if set, role can be in any partition (partition option is ignored)
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
      onlyAssigned: false,
      anyPartition: false
    });

    user = Roles._resolveUser(user);

    if (!user) return [];

    if (options.anyPartition) {
      roles = user.roles || [];
    }
    else {
      roles = _.filter(user.roles || [], Roles._partitionMatcher(options.partition));
    }

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
   *   - anyPartition: if set, role can be in any partition (partition option is ignored)
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
      queryOptions: queryOptions || {},
      anyPartition: false
    });

    if (options.anyPartition) {
      query = {
        'roles.role': {$in: roles}
      };
    }
    else {
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
    }

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

  _roleMatcher: function (roleName) {
    return function (userRole) {
      return userRole.role === roleName;
    };
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
