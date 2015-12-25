"use strict";

// Create default indexes for roles and users collection.

Meteor.roles._ensureIndex({name: 1}, {unique: 1});

// Index only on "roles.role" is not needed because the combined index works for it as well.
Meteor.users._ensureIndex({'roles.role': 1, 'roles.partition': 1});
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
   * @method _isNewField
   * @param {Array} roles `Meteor.users` document `roles` field.
   * @return {Boolean} Returns `true` if the `roles` field is in the new format.
   *                    If it is ambiguous or it is not, returns `false`.
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
   *                    If it is ambiguous or it is not, returns `false`.
   * @for Roles
   * @private
   * @static
   */
  _isOldField: function (roles) {
    return (_.isArray(roles) && _.isString(roles[0])) || (_.isObject(roles) && !_.isArray(roles));
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
          role: role,
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
            role: role,
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
        if (!usingGroups) throw new Error("Role '" + userRole.role + "' with partition '" + userRole.partition + "' without enabled groups.");

        // escape
        var partition = userRole.partition.replace(/\./g, '_');

        if (partition[0] === '$') throw new Error("Group name '" + partition + "' start with $.");

        roles[partition] = roles[partition] || [];
        roles[partition].push(userRole.role);
      }
      else {
        if (usingGroups) {
          roles.__global_roles__ = roles.__global_roles__ || [];
          roles.__global_roles__.push(userRole.role);
        }
        else {
          roles.push(userRole.role);
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
   * Migrates `Meteor.users` and `Meteor.roles` to the new format.
   *
   * @method _forwardMigrate
   * @param {Function} updateUser Function which updates the user object. Default `_defaultUpdateUser`.
   * @for Roles
   * @private
   * @static
   */
  _forwardMigrate: function (updateUser) {
    updateUser = updateUser || Roles._defaultUpdateUser;

    Meteor.roles.update({children: {$exists: false}}, {$set: {children: []}}, {multi: true});

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
   * @param {Boolean} usingGroups Should we use groups or not.
   * @for Roles
   * @private
   * @static
   */
  _backwardMigrate: function (updateUser, usingGroups) {
    updateUser = updateUser || Roles._defaultUpdateUser;

    Meteor.roles.update({}, {$unset: {children: ''}}, {multi: true});

    Meteor.users.find().forEach(function (user, index, cursor) {
      if (!Roles._isOldField(user.roles)) {
        updateUser(user, Roles._convertToOldField(user.roles, usingGroups));
      }
    });
  }
});
