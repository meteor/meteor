;(function () {

/**
 * Provides functions related to user authorization. Compatible with built-in Meteor accounts packages.
 *
 * It uses `roles` field to `Meteor.users` documents which is an array of subdocuments with the following
 * schema:
 *  - `_id`: role name
 *  - `partition`: partition name
 *  - `assigned`: boolean, if the role was manually assigned (set), or was automatically inferred (eg., subroles)
 *
 * Roles themselves are accessible throgh `Meteor.roles` collection and documents consist of:
 *  - `_id`: role name
 *  - `children`: list of subdocuments:
 *    - `_id`
 *
 * Children list elements are subdocuments so that they can be easier extended in the future or by plugins.
 *
 * Roles can have multiple parents and can be children (subroles) of multiple roles.
 *
 * Example: `{_id: "admin", children: [{_id: "editor"}]}`
 *
 * @module Roles
 */
 if (!Meteor.roles) {
  Meteor.roles = new Mongo.Collection("roles");
}

/**
 * @class Roles
 */
if ('undefined' === typeof Roles) {
  Roles = {};
}

"use strict";

var getGroupsForUserDeprecationWarning = false;

_.extend(Roles, {

  /**
   * Used as a global group (now partition) name. Not used anymore.
   *
   * @property GLOBAL_GROUP
   * @static
   * @deprecated
   */
  GLOBAL_GROUP: null,

  /**
   * Create a new role.
   *
   * @method createRole
   * @param {String} roleName Name of role.
   * @param {Object} [options] Options:
   *   - `unlessExists`: if `true`, exception will not be thrown in the role already exists
   * @return {String} ID of the new role.
   * @static
   */
  createRole: function (roleName, options) {
    var match;

    options = options || {};

    Roles._checkRoleName(roleName);

    options = _.defaults(options, {
      unlessExists: false
    });

    try {
      return Meteor.roles.insert({_id: roleName, children: []});
    } catch (e) {
      // (from Meteor accounts-base package, insertUserDoc func)
      // XXX string parsing sucks, maybe
      // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
      if (e.name !== 'MongoError') throw e;
      match = e.err.match(/E11000 duplicate key error index: ([^ ]+)/);
      if (!match) throw e;
      if (match[1].indexOf('$_id') !== -1) {
        if (options.unlessExists) return null;
        throw new Error("Role '" + roleName + "' already exists.");
      }
      throw e;
    }
  },

  /**
   * Delete an existing role.
   *
   * If the role is set for any user, it is automatically unset.
   *
   * @method deleteRole
   * @param {String} roleName Name of role.
   * @static
   */
  deleteRole: function (roleName) {
    var roles;

    Roles._checkRoleName(roleName);

    // we first remove the role as a children, otherwise
    // Roles._assureConsistency might re-add the role
    Meteor.roles.update({}, {
      $pull: {
        children: {
          _id: roleName
        }
      }
    }, {multi: true});

    Roles.getUsersInRole(roleName, {
      anyPartition: true,
      queryOptions: {
        fields: {
          _id: 1,
          roles: 1
        }
      }
    }).forEach(function (user, index, cursor) {
      // role can be assigned multiple times to the user, for multiple partitions
      // we have to remove the role for each of those partitions
      roles = _.filter(user.roles, Roles._roleMatcher(roleName));
      _.each(roles, function (role) {
        Roles._removeUserFromRole(user, roleName, {
          partition: role.partition,
          // we want to remove the role in any case
          _assigned: null
        });
      });

      // handle the edge case
      Roles._assureConsistency(user);
    });

    // remove the role itself
    Meteor.roles.remove({_id: roleName});
  },

  /**
   * Add role parent to the role.
   *
   * Previous parents are kept (role can have multiple parents). For users which have the
   * parent role set, new subroles are added automatically.
   *
   * @method addRoleParent
   * @param {String} roleName Name of role.
   * @param {String} parentName Name of parent role.
   * @static
   */
  addRoleParent: function (roleName, parentName) {
    var role,
        count,
        parentRoles,
        rolesToCheck,
        alreadyCheckedRoles,
        checkRoleName,
        checkRole;

    Roles._checkRoleName(roleName);
    Roles._checkRoleName(parentName);

    // query to get role's children
    role = Meteor.roles.findOne({_id: roleName});

    if (!role) {
      throw new Error("Role '" + roleName + "' does not exist.");
    }

    // detect cycles
    alreadyCheckedRoles = [];
    rolesToCheck = _.pluck(role.children, '_id');
    while (rolesToCheck.length) {
      checkRoleName = rolesToCheck.pop();
      if (checkRoleName === parentName) {
        throw new Error("Roles '" + roleName + "' and '" + parentName + "' would form a cycle.");
      }
      alreadyCheckedRoles.push(checkRoleName);

      checkRole = Meteor.roles.findOne({_id: checkRoleName});

      // This should not happen, but this is a problem to address at some other time.
      if (!checkRole) continue;

      rolesToCheck = _.union(rolesToCheck, _.difference(_.pluck(checkRole.children, '_id'), alreadyCheckedRoles));
    }

    count = Meteor.roles.update({
      _id: parentName,
      'children._id': {
        $ne: role._id
      }
    }, {
      $addToSet: {
        children: {
          _id: role._id
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
        Roles._addUserToRole(user, roleName, {
          partition: parentRole.partition,
          // we are assigning a subrole, so we set it as unassigned,
          // but only if they do not already exist
          _assigned: null
        });
      });
    });
  },

  /**
   * Remove role parent from the role.
   *
   * Other parents are kept (role can have multiple parents). For users which have the
   * parent role set, removed subrole is removed automatically.
   *
   * @method removeRoleParent
   * @param {String} roleName Name of role.
   * @param {String} parentName Name of parent role.
   * @static
   */
  removeRoleParent: function (roleName, parentName) {
    var role,
        count,
        parentRoles;

    Roles._checkRoleName(roleName);
    Roles._checkRoleName(parentName);

    // check for role existence
    // this would not really be needed, but we are trying to match addRoleParent
    role = Meteor.roles.findOne({_id: roleName}, {fields: {_id: 1}});

    if (!role) {
      throw new Error("Role '" + roleName + "' does not exist.");
    }

    count = Meteor.roles.update({
      _id: parentName
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
        Roles._removeUserFromRole(user, roleName, {
          partition: parentRole.partition,
          // but we want to remove it only if it was not also explicitly assigned
          _assigned: false
        });
      });

      // handle the edge case
      Roles._assureConsistency(user);
    });
  },

  /**
   * Add users to roles.
   *
   * Adds roles to existing roles for each user.
   *
   * @example
   *     Roles.addUsersToRoles(userId, 'admin')
   *     Roles.addUsersToRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.addUsersToRoles([user1, user2], ['user','editor'])
   *     Roles.addUsersToRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *
   * @method addUsersToRoles
   * @param {Array|String} users User ID(s) or object(s) with an `_id` field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles have to exist.
   * @param {Object|String} [options] Options:
   *   - `partition`: name of the partition, or `null` for the global role
   *   - `ifExists`: if `true`, do not throw an exception if the role does not exist
   *
   * Alternatively, it can be a partition name string.
   * @static
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

    Roles._checkPartitionName(options.partition);

    options = _.defaults(options, {
      ifExists: false,
      // internal option, should not be used publicly because it will break assumptions
      // in te code; publicly, you can only add users to an assigned role
      // should the role be set as assigned, default is `true`; `null` is the same as `false`,
      // only that it does not force the value to `false` if the role is already assigned
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
   * Replaces all existing roles with a new set of roles.
   *
   * @example
   *     Roles.setUserRoles(userId, 'admin')
   *     Roles.setUserRoles(userId, ['view-secrets'], 'example.com')
   *     Roles.setUserRoles([user1, user2], ['user','editor'])
   *     Roles.setUserRoles([user1, user2], ['glorious-admin', 'perform-action'], 'example.org')
   *
   * @method setUserRoles
   * @param {Array|String} users User ID(s) or object(s) with an `_id` field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles have to exist.
   * @param {Object|String} [options] Options:
   *   - `partition`: name of the partition, or `null` for the global role
   *   - `ifExists`: if `true`, do not throw an exception if the role does not exist
   *
   * Alternatively, it can be a partition name string.
   * @static
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

    Roles._checkPartitionName(options.partition);

    options = _.defaults(options, {
      ifExists: false,
      // internal option, should not be used publicly because it will break assumptions
      // in te code; publicly, you can only add users to an assigned role
      // should the role be set as assigned, default is `true`; `null` is the same as `false`,
      // only that it does not force the value to `false` if the role is already assigned
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

  /**
   * Add one user to one role.
   *
   * @method _addUserToRole
   * @param {String|Object} user User ID or object with an `_id` field.
   * @param {String} roleName Name of the role to add the user to. The role have to exist.
   * @param {Object} options Options:
   *   - `partition`: name of the partition, or `null` for the global role
   *   - `ifExists`: if `true`, do not throw an exception if the role does not exist
   *   - `_assigned`: internal option, should not be used publicly because it will break assumptions
   *     in te code; publicly, you can only add users to an assigned role
   *     should the role be set as assigned (`true`), `null` is the same as `false`,
   *     only that it does not force the value to `false` if the role is already assigned
   * @return {Array} Roles set during the call (even those already set).
   * @private
   * @static
   */
  _addUserToRole: function (user, roleName, options) {
    var id,
        role,
        count,
        setRoles;

    Roles._checkRoleName(roleName);
    Roles._checkPartitionName(options.partition);

    if (_.isObject(user)) {
      id = user._id;
    }
    else {
      id = user;
    }

    if (!id) return [];

    role = Meteor.roles.findOne({_id: roleName}, {fields: {children: 1}});

    if (!role) {
      if (options.ifExists) {
        return [];
      }
      else {
        throw new Error("Role '" + roleName + "' does not exist.");
      }
    }

    // add new role if it is not already added
    count = Meteor.users.update({
      _id: id,
      roles: {
        $not: {
          $elemMatch: {
            _id: roleName,
            partition: options.partition
          }
        }
      }

    }, {
      $addToSet: {
        roles: {
          _id: roleName,
          partition: options.partition,
          // we want to make sure it is a boolean value
          assigned: !!options._assigned
        }
      }
    });

    if (!count) {
      // a role has not been added, it maybe already exists
      if (options._assigned) {
        // let's make sure it is set as assigned
        Meteor.users.update({
          _id: id,
          roles: {
            $elemMatch: {
              _id: roleName,
              partition: options.partition
            }
          }

        }, {
          $set: {
            'roles.$.assigned': true
          }
        });
      }
      else if (options._assigned === false) {
        // let's make sure it is set as unassigned
        Meteor.users.update({
          _id: id,
          roles: {
            $elemMatch: {
              _id: roleName,
              partition: options.partition
            }
          }

        }, {
          $set: {
            'roles.$.assigned': false
          }
        });
      }
    }

    setRoles = [{
      _id: roleName,
      partition: options.partition
    }];

    _.each(role.children, function (child) {
      // subroles are set as unassigned, but only if they do not already exist
      setRoles = setRoles.concat(Roles._addUserToRole(user, child._id, _.extend({}, options, {_assigned: null})));
    });

    return setRoles;
  },

  /**
   * Remove users from assigned roles.
   *
   * @example
   *     Roles.removeUsersFromRoles(userId, 'admin')
   *     Roles.removeUsersFromRoles([userId, user2], ['editor'])
   *     Roles.removeUsersFromRoles(userId, ['user'], 'group1')
   *
   * @method removeUsersFromRoles
   * @param {Array|String} users User ID(s) or object(s) with an `_id` field.
   * @param {Array|String} roles Name(s) of roles to add users to. Roles have to exist.
   * @param {Object|String} [options] Options:
   *   - `partition`: name of the partition, or `null` for the global role
   *
   * Alternatively, it can be a partition name string.
   * @static
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

    Roles._checkPartitionName(options.partition);

    options = _.defaults(options, {
      // internal option, should not be used publicly because it will break assumptions
      // in te code; publicly, you can only remove users from an assigned role
      // when should the role be removed, default is `true` which means only when it is assigned,
      // `false` means when it is not assigned, and `null` means always
      _assigned: true
    });

    _.each(users, function (user) {
      _.each(roles, function (role) {
        Roles._removeUserFromRole(user, role, options);
      });

      // handle the edge case
      Roles._assureConsistency(user);
    });
  },

  /**
   * Remove one user from one role.
   *
   * WARNING: It leaves user's roles in a possibly inconsistent state. Because we allow the same
   * role to be a child of multiple roles it might happen that it removes some subroles which
   * it should not because they are in effect also through some other parent role. You should always
   * call `_assureConsistency` after you are finished with calls to `_removeUserFromRole` for a
   * particular user.
   *
   * @method _removeUserFromRole
   * @param {String|Object} user User ID or object with an `_id` field.
   * @param {String} roleName Name of the role to add the user to. The role have to exist.
   * @param {Object} options Options:
   *   - `partition`: name of the partition, or `null` for the global role
   *   - `_assigned`: internal option, should not be used publicly because it will break assumptions
   *     in te code; publicly, you can only remove users from an assigned role
   *     if `true`, only manually assigned roles are removed, if `false`, only automatically
   *     assigned roles are removed, if `null`, any role is removed
   * @private
   * @static
   */
  _removeUserFromRole: function (user, roleName, options) {
    var id,
        role,
        update;

    Roles._checkRoleName(roleName);
    Roles._checkPartitionName(options.partition);

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
          _id: roleName,
          partition: options.partition
        }
      }
    };

    if (options._assigned) {
      update.$pull.roles.assigned = true;
    }
    else if (options._assigned === false) {
      update.$pull.roles.assigned = false;
    }

    // we try to remove the role in every case, whether the role really exists or not
    Meteor.users.update(id, update);

    role = Meteor.roles.findOne({_id: roleName}, {fields: {children: 1}});

    // role does not exist, we do not anything more
    if (!role) return;

    _.each(role.children, function (child) {
      // if a child role has been assigned explicitly, we do not remove it
      Roles._removeUserFromRole(user, child._id, _.extend({}, options, {_assigned: false}));
    });
  },

  /**
   * Makes sure all subroles are correctly set, and no extra subroles are set which should not be.
   *
   * Used internally after complicated changes, but it can also be used whenever one feels that
   * there might be inconsistencies (eg., after a crash).
   *
   * We simply re-set to the user their assigned roles again and remove any roles which
   * are marked as not explicitly assigned, and have not been part of what we currently set.
   *
   * @method _assureConsistency
   * @param {String|Object} user User ID or an actual user object.
   * @private
   * @static
   */
  _assureConsistency: function (user) {
    var roles,
        setRoles;

    // we want always the latest state
    user = Roles._resolveUser(user, true);

    // only assigned roles
    roles = _.filter(user.roles, Roles._onlyAssignedMatcher());

    setRoles = [];
    _.each(roles, function (role) {
      setRoles = setRoles.concat(Roles._addUserToRole(user, role._id, {
        partition: role.partition,
        _assigned: role.assigned, // this is true
        ifExists: true
      }));
    });

    if (setRoles.length) {
      // remove all extra entries which should not be there
      Meteor.users.update(user._id, {
        $pull: {
          roles: {
            $nor: _.map(setRoles, function (role) {return _.pick(role, '_id', 'partition')})
          }
        }
      });
    }
    else {
      Meteor.users.update(user._id, {$set: {roles: []}});
    }
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
   * @method userIsInRole
   * @param {String|Object} user User ID or an actual user object.
   * @param {String|Array} roles Name of role or an array of roles to check against. If array,
   *                             will return `true` if user is in _any_ role.
   *                             Roles do not have to exist.
   * @param {Object|String} [options] Options:
   *   - `partition`: name of the partition; if supplied, limits check to just that partition;
   *     the user's global roles will always be checked whether partition is specified or not
   *   - `anyPartition`: if set, role can be in any partition (`partition` option is ignored)
   *
   * Alternatively, it can be a partition name string.
   * @return {Boolean} `true` if user is in _any_ of the target roles
   * @static
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

    Roles._checkPartitionName(options.partition);

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
        'roles._id': {$in: roles}
      };
    }
    else {
      query = {
        _id: id,
        $or: [{
          roles: {
            $elemMatch: {
              _id: {$in: roles},
              partition: options.partition
            }
          }
        }, {
          roles: {
            $elemMatch: {
              _id: {$in: roles},
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
   * @method getRolesForUser
   * @param {String|Object} user User ID or an actual user object.
   * @param {Object|String} [options] Options:
   *   - `partition`: name of partition to provide roles for; if not specified, global roles are returned
   *   - `anyPartition`: if set, role can be in any partition (`partition` option is ignored)
   *   - `fullObjects`: return full roles objects (`true`) or just names (`false`) (default `false`)
   *   - `onlyAssigned`: return only assigned roles and not automatically inferred (like subroles)
   *
   * Alternatively, it can be a partition name string.
   * @return {Array} Array of user's roles, unsorted.
   * @static
   */
  getRolesForUser: function (user, options) {
    var roles;

    options = options || {};

    if (_.isString(options)) {
      options = {partition: options};
    }

    options.partition = options.partition || null;

    Roles._checkPartitionName(options.partition);

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

    return _.uniq(_.pluck(roles, '_id'));
  },

  /**
   * Retrieve cursor of all existing roles.
   *
   * @method getAllRoles
   * @param {Object} [queryOptions] Options which are passed directly
   *                                through to `Meteor.roles.find(query, options)`.
   * @return {Cursor} Cursor of existing roles.
   * @static
   */
  getAllRoles: function (queryOptions) {
    queryOptions = queryOptions || {sort: {_id: 1}};

    return Meteor.roles.find({}, queryOptions);
  },

  /**
   * Retrieve all users who are in target role.
   *
   * Options:
   *
   * @method getUsersInRole
   * @param {String|Array} roles Name of role or an array of roles. If array, users
   *                             returned will have at least one of the roles
   *                             specified but need not have _all_ roles.
   *                             Roles do not have to exist.
   * @param {Object|String} [options] Options:
   *   - `partition`: name of the partition to restrict roles to; user's global
   *     roles will also be checked
   *   - `anyPartition`: if set, role can be in any partition (`partition` option is ignored)
   *   - `queryOptions`: options which are passed directly
   *     through to `Meteor.users.find(query, options)`
   *
   * Alternatively, it can be a partition name string.
   * @param {Object} [queryOptions] Options which are passed directly
   *                                through to `Meteor.users.find(query, options)`
   * @return {Cursor} Cursor of users in roles.
   * @static
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

    Roles._checkPartitionName(options.partition);

    options = _.defaults(options, {
      queryOptions: queryOptions || {},
      anyPartition: false
    });

    if (options.anyPartition) {
      query = {
        'roles._id': {$in: roles}
      };
    }
    else {
      query = {
        $or: [{
          roles: {
            $elemMatch: {
              _id: {$in: roles},
              partition: options.partition
            }
          }
        }, {
          roles: {
            $elemMatch: {
              _id: {$in: roles},
              partition: null
            }
          }
        }]
      };
    }

    return Meteor.users.find(query, options.queryOptions);
  },

  /**
   * Deprecated. Use `getPartitionsForUser` instead.
   *
   * @method getGroupsForUser
   * @static
   * @deprecated
   */
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
   * @param {String|Object} user User ID or an actual user object.
   * @param {String} [roles] Name of roles to restrict partitions to.
   *
   * @return {Array} Array of user's partitions, unsorted.
   * @static
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
      if (roles && !_.contains(roles, userRole._id)) return;

      partitions.push(userRole.partition);
    });

    return _.uniq(partitions);
  },

  /**
   * Resolves the user ID into an actual user object with `roles` field,
   * if it is not already.
   *
   * @method _resolveUser
   * @param {String|Object} user User ID or an actual user object.
   * @param {Boolean} force Load a new user object even if it is already one.
   * @return {Object} User object.
   * @private
   * @static
   */
  _resolveUser: function (user, force) {
    // TODO: We could use $elemMatch to limit returned fields here.
    if (!_.isObject(user)) {
      user = Meteor.users.findOne(
               {_id: user},
               {fields: {roles: 1}});
    } else if (force || !_.has(user, 'roles')) {
      user = Meteor.users.findOne(
               {_id: user._id},
               {fields: {roles: 1}});
    }

    return user;
  },

  /**
   * @method _roleMatcher
   * @param {String} roleName A role name to match against.
   * @return {Function} A matcher function which accepts a role object and returns `true`
   *                     if its name matches `roleName`.
   * @private
   * @static
   */
  _roleMatcher: function (roleName) {
    return function (userRole) {
      return userRole._id === roleName;
    };
  },

  /**
   * @method _roleAndPartitionMatcher
   * @param {String} roleName A role name to match against.
   * @param {String} partition A partition to match against.
   * @return {Function} A matcher function which accepts a role object and returns `true`
   *                     if its name matches `roleName`, and partition matches `partition`.
   * @private
   * @static
   */
  _roleAndPartitionMatcher: function (roleName, partition) {
    return function (userRole) {
      // == used on purpose in "userRole.partition == null"
      return (userRole._id === roleName && userRole.partition === partition) ||
        (userRole._id === roleName && (!_.has(userRole, 'partition') || userRole.partition == null));
    };
  },

  /**
   * @method _partitionMatcher
   * @param {String} partition A partition to match against.
   * @return {Function} A matcher function which accepts a role object and returns `true`
   *                     if its partition matches `partition`.
   * @private
   * @static
   */
  _partitionMatcher: function (partition) {
    return function (userRole) {
      // == used on purpose in "userRole.partition == null"
      return (userRole.partition === partition) ||
        (!_.has(userRole, 'partition') || userRole.partition == null);
    };
  },

  /**
   * @method _onlyAssignedMatcher
   * @return {Function} A matcher function which accepts a role object and returns `true`
   *                     if the role is an assigned role.
   * @private
   * @static
   */
  _onlyAssignedMatcher: function () {
    return function (userRole) {
      return !!userRole.assigned;
    };
  },

  /**
   * Throw an exception if `roleName` is an invalid role name.
   *
   * @method _checkRoleName
   * @param {String} roleName A role name to match against.
   * @private
   * @static
   */
  _checkRoleName: function (roleName) {
    if (!roleName || !_.isString(roleName) || Roles._trim(roleName) !== roleName) {
      throw new Error("Invalid role name '" + roleName + "'.");
    }
  },

  /**
   * Throw an exception if `partitionName` is an invalid partition name.
   *
   * @method _checkRoleName
   * @param {String} partitionName A partition name to match against.
   * @private
   * @static
   */
  _checkPartitionName: function (partitionName) {
    if (partitionName === null) return;

    if (!partitionName || !_.isString(partitionName) || Roles._trim(partitionName) !== partitionName) {
      throw new Error("Invalid partition name '" + partitionName + "'.");
    }
  },

  /**
   * @param {String} string Input string.
   * @return {String} Trimmed string.
   * @private
   * @static
   */
  _trim: function (string) {
    if (string.trim) {
      return string.trim();
    }
    else {
      return string.replace(/^\s+|\s+$/g, '');
    }
  }

});  // end _.extend(Roles ...)

}());
