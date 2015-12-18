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
  _isNewField: function (roles) {
    return _.isArray(roles) && _.isObject(roles[0]);
  },

  _isOldField: function (roles) {
    return (_.isArray(roles) && _.isString(roles[0])) || _.isObject(roles);
  },

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
        // unescape
        group = group.replace(/_/g, '.');

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
      // We always convert to the global roles syntax.

      if (userRole.partition) {
        if (!usingGroups) throw new Error("Role '" + userRole.role + "' with partition '" + userRole.partition + "' without enabled groups.");

        // escape
        userRole.partition = group.replace(/./g, '_');

        if (userRole.partition[0] === '$') throw new Error("Group name '" + userRole.partition + "' start with $.");

        roles[userRole.partition] = roles[userRole.partition] || [];
        roles[userRole.partition].push(userRole.role);
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

  _defaultUpdateUser: function (user, roles) {
    Meteor.users.update({
      _id: user._id,
      // making sure nothing changed in meantime
      roles: user.roles
    }, {
      $set: {roles: roles}
    });
  },

  _forwardMigrate: function (updateUser) {
    updateUser = updateUser || Roles._defaultUpdateUser;

    // TODO: Migrate rules collection.

    Meteor.users.find().forEach(function (user, index, cursor) {
      if (!Roles._isNewField(user.roles)) {
        updateUser(user, Roles._convertToNewField(user.roles));
      }
    });
  },

  _backwardMigrate: function (updateUser, usingGroups) {
    updateUser = updateUser || Roles._defaultUpdateUser;

    // TODO: Migrate rules collection.

    Meteor.users.find().forEach(function (user, index, cursor) {
      if (!Roles._isOldField(user.roles)) {
        updateUser(user, Roles._convertToOldField(user.roles, usingGroups));
      }
    });
  }
});
