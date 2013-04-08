;(function () {

  "use strict";

  // Mock Meteor.user() for role testing
  Meteor.user = function () {
    return {
      _id: 'testId',
      roles: ['user','manage-users']
    }
  }


  Tinytest.add(
    'roles - can check current users roles via template helper', 
    function (test) {
      var isInRole = Roles._handlebarsHelpers.isInRole,
          expected,
          actual

      test.equal(typeof isInRole, 'function', "'isInRole' helper not registered")

      expected = true
      actual = isInRole('admin, manage-users')
      test.equal(actual, expected)
      
      expected = false
      actual = isInRole('admin')
      test.equal(actual, expected)
    })


}());
