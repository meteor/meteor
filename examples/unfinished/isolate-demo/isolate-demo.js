if (Meteor.isClient) {
  Template.hello.created = function () {
    this.customProperties = { some: 'data' };
  };

  //Session.setDefault('array', ['foo', 'bar']);
  Session.setDefault('array', [{_id: 'foo'}, {_id: 'bar'}]);

  Meteor.startup(function () {
    var n = 1;
    Meteor.setInterval(function () {
      n++;
      Session.set('array', _.map(Session.get('array'), function (x) {
        return _.extend({}, x, {n:n});
       }));
    }, 1000);
  });

  Template.hello.dynamicTemplate = function (name) {
    return UI.Component.extend({
      render: function () {
        return name + Math.random();
      }
    });
  };

  Template.hello.array = function () {
    return Session.get('array');
  };

  Template.hello.greeting = function () {
    return "Welcome to nothing...";
  };

  Template.hello.events({
    'click input': function (e, template) {
      // template data, if any, is available in 'this'
      console.log(template.customProperties.some);
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    // code to run on server at startup
  });
}
