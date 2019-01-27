/* global Roles, describe, it, beforeEach */
import { Meteor } from 'meteor/meteor'
import { Tracker } from 'meteor/tracker'
import { assert } from 'chai'

// To ensure that the files are loaded for coverage
import '../roles_common'

describe('roles', function () {
  var users
  var roles = ['admin', 'editor', 'user']

  Tracker.autorun(function () {
    Roles.assignmentSubscription = Meteor.subscribe('_roleAssignments')
  })

  users = {
    'eve': {
      _id: 'eve'
    },
    'bob': {
      _id: 'bob'
    },
    'joe': {
      _id: 'joe'
    }
  }

  function testUser (username, expectedRoles, group) {
    var user = users[username]

    // test using user object rather than userId to avoid mocking
    roles.forEach(function (role) {
      var expected = expectedRoles.includes(role)
      var msg = username + ' expected to have \'' + role + '\' permission but does not'
      var nmsg = username + ' had un-expected permission ' + role

      if (expected) {
        assert.isTrue(Roles.userIsInRole(user, role, group), msg)
      } else {
        assert.isFalse(Roles.userIsInRole(user, role, group), nmsg)
      }
    })
  }

  // Mock Meteor.user() for isInRole handlebars helper testing
  Meteor.user = function () {
    return users.eve
  }

  beforeEach((done) => {
    Meteor.roleAssignment.insert({
      user: users.eve,
      role: { _id: 'admin' },
      inheritedRoles: [{ _id: 'admin' }]
    })
    Meteor.roleAssignment.insert({
      user: users.eve,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }]
    })

    Meteor.roleAssignment.insert({
      user: users.bob,
      role: { _id: 'user' },
      inheritedRoles: [{ _id: 'user' }],
      scope: 'group1'
    })
    Meteor.roleAssignment.insert({
      user: users.bob,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }],
      scope: 'group2'
    })

    Meteor.roleAssignment.insert({
      user: users.joe,
      role: { _id: 'admin' },
      inheritedRoles: [{ _id: 'admin' }]
    })
    Meteor.roleAssignment.insert({
      user: users.joe,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }],
      scope: 'group1'
    })

    const timer = () => {
      if (!Roles.assignmentSubscription.ready()) {
        Meteor.setTimeout(timer, 100)
      } else {
        done()
      }
    }

    timer()
  })

  it('can check current users roles via template helper', function () {
    var isInRole
    var expected
    var actual

    if (!Roles._handlebarsHelpers) {
      // probably running package tests outside of a Meteor app.
      // skip this test.
      return
    }

    isInRole = Roles._handlebarsHelpers.isInRole
    assert.equal(typeof isInRole, 'function', "'isInRole' helper not registered")

    expected = true
    actual = isInRole('admin, editor')
    assert.equal(actual, expected)

    expected = true
    actual = isInRole('admin')
    assert.equal(actual, expected)

    expected = false
    actual = isInRole('unknown')
    assert.equal(actual, expected)
  })

  it('can check if user is in role', function () {
    testUser('eve', ['admin', 'editor'])
  })

  it('can check if user is in role by group', function () {
    testUser('bob', ['user'], 'group1')
    testUser('bob', ['editor'], 'group2')
  })

  it('can check if user is in role with Roles.GLOBAL_GROUP', function () {
    testUser('joe', ['admin'])
    testUser('joe', ['admin'], Roles.GLOBAL_GROUP)
    testUser('joe', ['admin', 'editor'], 'group1')
  })
})
