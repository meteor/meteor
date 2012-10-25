(function () {

  Tinytest.add('session - get/set/equals types', function (test) {
    test.equal(Session.get('u'), undefined);
    test.isTrue(Session.equals('u', undefined));
    test.isFalse(Session.equals('u', null));
    test.isFalse(Session.equals('u', 0));
    test.isFalse(Session.equals('u', ''));

    Session.set('u', undefined);
    test.equal(Session.get('u'), undefined);
    test.isTrue(Session.equals('u', undefined));
    test.isFalse(Session.equals('u', null));
    test.isFalse(Session.equals('u', 0));
    test.isFalse(Session.equals('u', ''));
    test.isFalse(Session.equals('u', 'undefined'));
    test.isFalse(Session.equals('u', 'null'));

    Session.set('n', null);
    test.equal(Session.get('n'), null);
    test.isFalse(Session.equals('n', undefined));
    test.isTrue(Session.equals('n', null));
    test.isFalse(Session.equals('n', 0));
    test.isFalse(Session.equals('n', ''));
    test.isFalse(Session.equals('n', 'undefined'));
    test.isFalse(Session.equals('n', 'null'));

    Session.set('t', true);
    test.equal(Session.get('t'), true);
    test.isTrue(Session.equals('t', true));
    test.isFalse(Session.equals('t', false));
    test.isFalse(Session.equals('t', 1));
    test.isFalse(Session.equals('t', 'true'));

    Session.set('f', false);
    test.equal(Session.get('f'), false);
    test.isFalse(Session.equals('f', true));
    test.isTrue(Session.equals('f', false));
    test.isFalse(Session.equals('f', 1));
    test.isFalse(Session.equals('f', 'false'));

    Session.set('num', 0);
    test.equal(Session.get('num'), 0);
    test.isTrue(Session.equals('num', 0));
    test.isFalse(Session.equals('num', false));
    test.isFalse(Session.equals('num', '0'));
    test.isFalse(Session.equals('num', 1));

    Session.set('str', 'true');
    test.equal(Session.get('str'), 'true');
    test.isTrue(Session.equals('str', 'true'));
    test.isFalse(Session.equals('str', true));

    Session.set('arr', [1, 2, {a: 1, b: [5, 6]}]);
    test.equal(Session.get('arr'), [1, 2, {b: [5, 6], a: 1}]);
    test.isFalse(Session.equals('arr', 1));
    test.isFalse(Session.equals('arr', '[1,2,{"a":1,"b":[5,6]}]'));
    test.throws(function () {
      Session.equals('arr', [1, 2, {a: 1, b: [5, 6]}]);
    });

    Session.set('obj', {a: 1, b: [5, 6]});
    test.equal(Session.get('obj'), {b: [5, 6], a: 1});
    test.isFalse(Session.equals('obj', 1));
    test.isFalse(Session.equals('obj', '{"a":1,"b":[5,6]}'));
    test.throws(function() { Session.equals('obj', {a: 1, b: [5, 6]}); });
  });

  Tinytest.add('session - objects are cloned', function (test) {
    Session.set('frozen-array', [1, 2, 3]);
    Session.get('frozen-array')[1] = 42;
    test.equal(Session.get('frozen-array'), [1, 2, 3]);

    Session.set('frozen-object', {a: 1, b: 2});
    Session.get('frozen-object').a = 43;
    test.equal(Session.get('frozen-object'), {a: 1, b: 2});
  });

  Tinytest.add('session - context invalidation for get', function (test) {
    var xGetExecutions = 0;
    Meteor.autorun(function () {
      ++xGetExecutions;
      Session.get('x');
    });
    test.equal(xGetExecutions, 1);
    Session.set('x', 1);
    // Invalidation shouldn't happen until flush time.
    test.equal(xGetExecutions, 1);
    Meteor.flush();
    test.equal(xGetExecutions, 2);
    // Setting to the same value doesn't re-run.
    Session.set('x', 1);
    Meteor.flush();
    test.equal(xGetExecutions, 2);
    Session.set('x', '1');
    Meteor.flush();
    test.equal(xGetExecutions, 3);
  });

  Tinytest.add('session - context invalidation for equals', function (test) {
    var xEqualsExecutions = 0;
    Meteor.autorun(function () {
      ++xEqualsExecutions;
      Session.equals('x', 5);
    });
    test.equal(xEqualsExecutions, 1);
    Session.set('x', 1);
    Meteor.flush();
    // Changing undefined -> 1 shouldn't affect equals(5).
    test.equal(xEqualsExecutions, 1);
    Session.set('x', 5);
    // Invalidation shouldn't happen until flush time.
    test.equal(xEqualsExecutions, 1);
    Meteor.flush();
    test.equal(xEqualsExecutions, 2);
    Session.set('x', 5);
    Meteor.flush();
    // Setting to the same value doesn't re-run.
    test.equal(xEqualsExecutions, 2);
    Session.set('x', '5');
    test.equal(xEqualsExecutions, 2);
    Meteor.flush();
    test.equal(xEqualsExecutions, 3);
    Session.set('x', 5);
    test.equal(xEqualsExecutions, 3);
    Meteor.flush();
    test.equal(xEqualsExecutions, 4);
  });

  Tinytest.add(
    'session - context invalidation for equals with undefined',
    function (test) {
      // Make sure the special casing for equals undefined works.
      var yEqualsExecutions = 0;
      Meteor.autorun(function () {
        ++yEqualsExecutions;
        Session.equals('y', undefined);
      });
      test.equal(yEqualsExecutions, 1);
      Session.set('y', undefined);
      Meteor.flush();
      test.equal(yEqualsExecutions, 1);
      Session.set('y', 5);
      test.equal(yEqualsExecutions, 1);
      Meteor.flush();
      test.equal(yEqualsExecutions, 2);
      Session.set('y', 3);
      Meteor.flush();
      test.equal(yEqualsExecutions, 2);
      Session.set('y', 'undefined');
      Meteor.flush();
      test.equal(yEqualsExecutions, 2);
      Session.set('y', undefined);
      test.equal(yEqualsExecutions, 2);
      Meteor.flush();
      test.equal(yEqualsExecutions, 3);
    });
}());
