if (Meteor.isClient) {

  Session.setDefault('array',
                     [{_id: 'foo', n: 0}, {_id: 'bar', n: 0}]);

  Meteor.startup(function () {
    var n = 1;
    Meteor.setInterval(function () {
      n++;
      Session.set('array', _.map(Session.get('array'), function (x) {
        return _.extend({}, x, {n:n});
       }));
    }, 1000);
  });

  UI.body.helpers({
    dynamicTemplate: function (name) {
      return Template[name].withData(Math.random());
    },

    array: function () {
      return Session.get('array');
    },

    arrayToString: function () {
      return EJSON.stringify(Session.get('array'));
    }
  });
}
