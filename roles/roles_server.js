/* global Meteor, Roles */
let indexFnAssignment
let indexFnRoles

if (Meteor.roles.createIndexAsync) {
  indexFnAssignment = Meteor.roleAssignment.createIndexAsync.bind(Meteor.roleAssignment)
  indexFnRoles = Meteor.roles.createIndexAsync.bind(Meteor.roles)
} else if (Meteor.roles.createIndex) {
  indexFnAssignment = Meteor.roleAssignment.createIndex.bind(Meteor.roleAssignment)
  indexFnRoles = Meteor.roles.createIndex.bind(Meteor.roles)
} else {
  indexFnAssignment = Meteor.roleAssignment._ensureIndex.bind(Meteor.roleAssignment)
  indexFnRoles = Meteor.roles._ensureIndex.bind(Meteor.roles)
}

[
  { 'user._id': 1, 'inheritedRoles._id': 1, scope: 1 },
  { 'user._id': 1, 'role._id': 1, scope: 1 },
  { 'role._id': 1 },
  { scope: 1, 'user._id': 1, 'inheritedRoles._id': 1 }, // Adding userId and roleId might speed up other queries depending on the first index
  { 'inheritedRoles._id': 1 }
].forEach(index => indexFnAssignment(index))
indexFnRoles({ 'children._id': 1 })

/*
 * Publish logged-in user's roles so client-side checks can work.
 *
 * Use a named publish function so clients can check `ready()` state.
 */
Meteor.publish('_roles', function () {
  const loggedInUserId = this.userId
  const fields = { roles: 1 }

  if (!loggedInUserId) {
    this.ready()
    return
  }

  return Meteor.users.find(
    { _id: loggedInUserId },
    { fields }
  )
})

Object.assign(Roles, {
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
    return !('name' in role) && 'children' in role
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
    return 'name' in role && !('children' in role)
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
    return Array.isArray(roles) && (typeof roles[0] === 'object')
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
    return (Array.isArray(roles) && (typeof roles[0] === 'string')) || ((typeof roles === 'object') && !Array.isArray(roles))
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
    if (!(typeof oldRole.name === 'string')) throw new Error("Role name '" + oldRole.name + "' is not a string.")

    return {
      _id: oldRole.name,
      children: []
    }
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
    if (!(typeof newRole._id === 'string')) throw new Error("Role name '" + newRole._id + "' is not a string.")

    return {
      name: newRole._id
    }
  },

  /**
   * @method _convertToNewField
   * @param {Array} oldRoles `Meteor.users` document `roles` field in the old format.
   * @param {Boolean} convertUnderscoresToDots Should we convert underscores to dots in group names.
   * @return {Array} Converted `roles` to the new format.
   * @for Roles
   * @private
   * @static
   */
  _convertToNewField: function (oldRoles, convertUnderscoresToDots) {
    const roles = []
    if (Array.isArray(oldRoles)) {
      oldRoles.forEach(function (role, index) {
        if (!(typeof role === 'string')) throw new Error("Role '" + role + "' is not a string.")

        roles.push({
          _id: role,
          scope: null,
          assigned: true
        })
      })
    } else if (typeof oldRoles === 'object') {
      Object.entries(oldRoles).forEach(([group, rolesArray]) => {
        if (group === '__global_roles__') {
          group = null
        } else if (convertUnderscoresToDots) {
          // unescape
          group = group.replace(/_/g, '.')
        }

        rolesArray.forEach(function (role) {
          if (!(typeof role === 'string')) throw new Error("Role '" + role + "' is not a string.")

          roles.push({
            _id: role,
            scope: group,
            assigned: true
          })
        })
      })
    }
    return roles
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
    let roles

    if (usingGroups) {
      roles = {}
    } else {
      roles = []
    }

    newRoles.forEach(function (userRole) {
      if (!(typeof userRole === 'object')) throw new Error("Role '" + userRole + "' is not an object.")

      // We assume that we are converting back a failed migration, so values can only be
      // what were valid values in 1.0. So no group names starting with $ and no subroles.

      if (userRole.scope) {
        if (!usingGroups) throw new Error("Role '" + userRole._id + "' with scope '" + userRole.scope + "' without enabled groups.")

        // escape
        const scope = userRole.scope.replace(/\./g, '_')

        if (scope[0] === '$') throw new Error("Group name '" + scope + "' start with $.")

        roles[scope] = roles[scope] || []
        roles[scope].push(userRole._id)
      } else {
        if (usingGroups) {
          roles.__global_roles__ = roles.__global_roles__ || []
          roles.__global_roles__.push(userRole._id)
        } else {
          roles.push(userRole._id)
        }
      }
    })
    return roles
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
      $set: { roles }
    })
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
    Meteor.roles.remove(oldRole._id)
    Meteor.roles.insert(newRole)
  },

  /**
   * @method _dropCollectionIndex
   * @param {Object} collection Collection on which to drop the index.
   * @param {String} indexName Name of the index to drop.
   * @for Roles
   * @private
   * @static
   */
  _dropCollectionIndex: function (collection, indexName) {
    try {
      collection._dropIndex(indexName)
    } catch (e) {
      const indexNotFound = /index not found/.test(e.message || e.err || e.errmsg)

      if (!indexNotFound) {
        throw e
      }
    }
  },

  /**
   * Migrates `Meteor.users` and `Meteor.roles` to the new format.
   *
   * @method _forwardMigrate
   * @param {Function} updateUser Function which updates the user object. Default `_defaultUpdateUser`.
   * @param {Function} updateRole Function which updates the role object. Default `_defaultUpdateRole`.
   * @param {Boolean} convertUnderscoresToDots Should we convert underscores to dots in group names.
   * @for Roles
   * @private
   * @static
   */
  _forwardMigrate: function (updateUser, updateRole, convertUnderscoresToDots) {
    updateUser = updateUser || Roles._defaultUpdateUser
    updateRole = updateRole || Roles._defaultUpdateRole

    Roles._dropCollectionIndex(Meteor.roles, 'name_1')

    Meteor.roles.find().forEach(function (role, index, cursor) {
      if (!Roles._isNewRole(role)) {
        updateRole(role, Roles._convertToNewRole(role))
      }
    })

    Meteor.users.find().forEach(function (user, index, cursor) {
      if (!Roles._isNewField(user.roles)) {
        updateUser(user, Roles._convertToNewField(user.roles, convertUnderscoresToDots))
      }
    })
  },

  /**
   * Moves the assignments from `Meteor.users` to `Meteor.roleAssignment`.
   *
   * @method _forwardMigrate2
   * @param {Object} userSelector An opportunity to share the work among instances. It's advisable to do the division based on user-id.
   * @for Roles
   * @private
   * @static
   */
  _forwardMigrate2: function (userSelector) {
    userSelector = userSelector || {}
    Object.assign(userSelector, { roles: { $ne: null } })

    Meteor.users.find(userSelector).forEach(function (user, index) {
      user.roles.filter((r) => r.assigned).forEach(r => {
        // Added `ifExists` to make it less error-prone
        Roles._addUserToRole(user._id, r._id, { scope: r.scope, ifExists: true })
      })

      Meteor.users.update({ _id: user._id }, { $unset: { roles: '' } })
    })

    // No need to keep the indexes around
    Roles._dropCollectionIndex(Meteor.users, 'roles._id_1_roles.scope_1')
    Roles._dropCollectionIndex(Meteor.users, 'roles.scope_1')
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
    updateUser = updateUser || Roles._defaultUpdateUser
    updateRole = updateRole || Roles._defaultUpdateRole

    Roles._dropCollectionIndex(Meteor.users, 'roles._id_1_roles.scope_1')
    Roles._dropCollectionIndex(Meteor.users, 'roles.scope_1')

    Meteor.roles.find().forEach(function (role, index, cursor) {
      if (!Roles._isOldRole(role)) {
        updateRole(role, Roles._convertToOldRole(role))
      }
    })

    Meteor.users.find().forEach(function (user, index, cursor) {
      if (!Roles._isOldField(user.roles)) {
        updateUser(user, Roles._convertToOldField(user.roles, usingGroups))
      }
    })
  },

  /**
   * Moves the assignments from `Meteor.roleAssignment` back to to `Meteor.users`.
   *
   * @method _backwardMigrate2
   * @param {Object} assignmentSelector An opportunity to share the work among instances. It's advisable to do the division based on user-id.
   * @for Roles
   * @private
   * @static
   */
  _backwardMigrate2: function (assignmentSelector) {
    assignmentSelector = assignmentSelector || {}

    if (Meteor.users.createIndex) {
      Meteor.users.createIndex({ 'roles._id': 1, 'roles.scope': 1 })
      Meteor.users.createIndex({ 'roles.scope': 1 })
    } else {
      Meteor.users._ensureIndex({ 'roles._id': 1, 'roles.scope': 1 })
      Meteor.users._ensureIndex({ 'roles.scope': 1 })
    }

    Meteor.roleAssignment.find(assignmentSelector).forEach(r => {
      const roles = Meteor.users.findOne({ _id: r.user._id }).roles || []

      const currentRole = roles.find(oldRole => oldRole._id === r.role._id && oldRole.scope === r.scope)
      if (currentRole) {
        currentRole.assigned = true
      } else {
        roles.push({
          _id: r.role._id,
          scope: r.scope,
          assigned: true
        })

        r.inheritedRoles.forEach(inheritedRole => {
          const currentInheritedRole = roles.find(oldRole => oldRole._id === inheritedRole._id && oldRole.scope === r.scope)

          if (!currentInheritedRole) {
            roles.push({
              _id: inheritedRole._id,
              scope: r.scope,
              assigned: false
            })
          }
        })
      }

      Meteor.users.update({ _id: r.user._id }, { $set: { roles } })
      Meteor.roleAssignment.remove({ _id: r._id })
    })
  }
})
