Roles.addRolesToUserObj = function (users, roles, group) {
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

  // ensure arrays to simplify code
  if (!_.isArray(users)) users = [users]
  if (!_.isArray(roles)) roles = [roles]

  
  // remove invalid roles
  roles = _.reduce(roles, function (memo, role) {
    if (role
        && 'string' === typeof role
        && role.trim().length > 0) {
      memo.push(role.trim())
    }
    return memo
  }, [])

  // if roles is empty, quit
  if (roles.length === 0) return

  // ensure all roles exist in 'roles' collection
  existingRoles = _.reduce(Meteor.roles.find({}).fetch(), function (memo, role) {
    memo[role.name] = true
    return memo
  }, {})
  _.each(roles, function (role) {
    if (!existingRoles[role]) {
      Roles.createRole(role)
    }
  })

  // ensure users is an array of objects
  _.each(users, function (user) {
    if ('object' !== typeof user) {
      throw new Error("Expected 'users' argument to be an object or array of objects")
    }
  })

  if (group) {

    // roles is a key/value dict object

    _.each(users, function (user) {
      user.roles = {}
      user.roles[group] = roles
    })

  } else {

    // roles is an array of strings
    
    _.each(users, function (user) {
      user.roles = roles
    })

  }

}  // end addRolesToUserObj
