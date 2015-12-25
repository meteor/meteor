"use strict";

// Create default indexes on users collection.
// Index only on "roles._id" is not needed because the combined index works for it as well.
Meteor.users._ensureIndex({'roles._id': 1, 'roles.partition': 1});
Meteor.users._ensureIndex({'roles.partition': 1});

/*
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
   * @method _isNewRole
   * @param {Object} role `Meteor.roles` document.
   * @return {Boolean} Returns `true` if the `role` is in the new format.
   *                   If it is ambiguous or it is not, returns `false`.
   * @for Roles
   * @private
   * @static
   */
  _isNewRole: function (role) {
    return !_.has(role, 'name') && _.has(role, 'children');
  },

  /**
   * @method _isOldRole
   * @param {Object} role `Meteor.roles` document.
   * @return {Boolean} Returns `true` if the `role` is in the old format.
   *                   If it is ambiguous or it is not, returns `false`.
   * @for Roles
   * @private
   * @static
   */
  _isOldRole: function (role) {
    return _.has(role, 'name') && !_.has(role, 'children');
  },

  /**
   * @method _isNewField
   * @param {Array} roles `Meteor.users` document `roles` field.
   * @return {Boolean} Returns `true` if the `roles` field is in the new format.
   *                   If it is ambiguous or it is not, returns `false`.
   * @for Roles
   * @private
   * @static
   */
  _isNewField: function (roles) {
    return _.isArray(roles) && _.isObject(roles[0]);
  },

  /**
   * @method _isOldField
   * @param {Array} roles `Meteor.users` document `roles` field.
   * @return {Boolean} Returns `true` if the `roles` field is in the old format.
   *                   If it is ambiguous or it is not, returns `false`.
   * @for Roles
   * @private
   * @static
   */
  _isOldField: function (roles) {
    return (_.isArray(roles) && _.isString(roles[0])) || (_.isObject(roles) && !_.isArray(roles));
  },

  /**
   * @method _convertToNewRole
   * @param {Object} oldRole `Meteor.roles` document.
   * @return {Object} Converted `role` to the new format.
   * @for Roles
   * @private
   * @static
   */
  _convertToNewRole: function (oldRole) {
    if (!_.isString(oldRole.name)) throw new Error("Role name '" + oldRole.name + "' is not a string.");

    return {
      _id: oldRole.name,
      children: []
    };
  },

  /**
   * @method _convertToOldRole
   * @param {Object} newRole `Meteor.roles` document.
   * @return {Object} Converted `role` to the old format.
   * @for Roles
   * @private
   * @static
   */
  _convertToOldRole: function (newRole) {
    if (!_.isString(newRole._id)) throw new Error("Role name '" + newRole._id + "' is not a string.");

    return {
      name: newRole._id
    };
  },

  /**
   * @method _convertToNewField
   * @param {Array} oldRoles `Meteor.users` document `roles` field in the old format.
   * @return {Array} Converted `roles` to the new format.
   * @for Roles
   * @private
   * @static
   */
  _convertToNewField: function (oldRoles) {
    var roles = [];
    if (_.isArray(oldRoles)) {
      _.each(oldRoles, function (role, index) {
        if (!_.isString(role)) throw new Error("Role '" + role + "' is not a string.");

        roles.push({
          _id: role,
          partition: null,
          assigned: true
        })
      });
    }
    else if (_.isObject(oldRoles)) {
      _.each(oldRoles, function (rolesArray, group) {
        if (group === '__global_roles__') {
          group = null;
        }
        else {
          // unescape
          group = group.replace(/_/g, '.');
        }

        _.each(rolesArray, function (role, index) {
          if (!_.isString(role)) throw new Error("Role '" + role + "' is not a string.");

          roles.push({
            _id: role,
            partition: group,
            assigned: true
          })
        });
      })
    }
    return roles;
  },

  /**
   * @method _convertToOldField
   * @param {Array} newRoles `Meteor.users` document `roles` field in the new format.
   * @param {Boolean} usingGroups Should we use groups or not.
   * @return {Array} Converted `roles` to the old format.
   * @for Roles
   * @private
   * @static
   */
  _convertToOldField: function (newRoles, usingGroups) {
    var roles;

    if (usingGroups) {
      roles = {};
    }
    else {
      roles = [];
    }

    _.each(newRoles, function (userRole, index) {
      if (!_.isObject(userRole)) throw new Error("Role '" + userRole + "' is not an object.");

      // We assume that we are converting back a failed migration, so values can only be
      // what were valid values in 1.0. So no group names starting with $ and no subroles.

      if (userRole.partition) {
        if (!usingGroups) throw new Error("Role '" + userRole._id + "' with partition '" + userRole.partition + "' without enabled groups.");

        // escape
        var partition = userRole.partition.replace(/\./g, '_');

        if (partition[0] === '$') throw new Error("Group name '" + partition + "' start with $.");

        roles[partition] = roles[partition] || [];
        roles[partition].push(userRole._id);
      }
      else {
        if (usingGroups) {
          roles.__global_roles__ = roles.__global_roles__ || [];
          roles.__global_roles__.push(userRole._id);
        }
        else {
          roles.push(userRole._id);
        }
      }
    });
    return roles;
  },

  /**
   * @method _defaultUpdateUser
   * @param {Object} user `Meteor.users` document.
   * @param {Array|Object} roles Value to which user's `roles` field should be set.
   * @for Roles
   * @private
   * @static
   */
  _defaultUpdateUser: function (user, roles) {
    Meteor.users.update({
      _id: user._id,
      // making sure nothing changed in meantime
      roles: user.roles
    }, {
      $set: {roles: roles}
    });
  },

  /**
   * @method _defaultUpdateRole
   * @param {Object} oldRole Old `Meteor.roles` document.
   * @param {Object} newRole New `Meteor.roles` document.
   * @for Roles
   * @private
   * @static
   */
  _defaultUpdateRole: function (oldRole, newRole) {
    Meteor.roles.remove(oldRole._id);
    Meteor.roles.insert(newRole);
  },

  /**
   * Migrates `Meteor.users` and `Meteor.roles` to the new format.
   *
   * @method _forwardMigrate
   * @param {Function} updateUser Function which updates the user object. Default `_defaultUpdateUser`.
   * @param {Function} updateRole Function which updates the role object. Default `_defaultUpdateRole`.
   * @for Roles
   * @private
   * @static
   */
  _forwardMigrate: function (updateUser, updateRole) {
    updateUser = updateUser || Roles._defaultUpdateUser;
    updateRole = updateRole || Roles._defaultUpdateRole;

    Meteor.roles.find().forEach(function (role, index, cursor) {
      if (!Roles._isNewRole(role)) {
        updateRole(role, Roles._convertToNewRole(role));
      }
    });

    Meteor.users.find().forEach(function (user, index, cursor) {
      if (!Roles._isNewField(user.roles)) {
        updateUser(user, Roles._convertToNewField(user.roles));
      }
    });
  },

  /**
   * Migrates `Meteor.users` and `Meteor.roles` to the old format.
   *
   * We assume that we are converting back a failed migration, so values can only be
   * what were valid values in the old format. So no group names starting with `$` and
   * no subroles.
   *
   * @method _backwardMigrate
   * @param {Function} updateUser Function which updates the user object. Default `_defaultUpdateUser`.
   * @param {Function} updateRole Function which updates the role object. Default `_defaultUpdateRole`.
   * @param {Boolean} usingGroups Should we use groups or not.
   * @for Roles
   * @private
   * @static
   */
  _backwardMigrate: function (updateUser, updateRole, usingGroups) {
    updateUser = updateUser || Roles._defaultUpdateUser;
    updateRole = updateRole || Roles._defaultUpdateRole;

    Meteor.roles.find().forEach(function (role, index, cursor) {
      if (!Roles._isOldRole(role)) {
        updateRole(role, Roles._convertToOldRole(role));
      }
    });

    Meteor.users.find().forEach(function (user, index, cursor) {
      if (!Roles._isOldField(user.roles)) {
        updateUser(user, Roles._convertToOldField(user.roles, usingGroups));
      }
    });
  }
});
