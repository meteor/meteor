if (Meteor.isClient) {
  
  var isParent = (window.location.pathname === '/');
  var isChild = ! isParent;

  Template.route.isParent = function () {
    return isParent;
  };

  Template.parent.testStatus = function () {
    return Session.get('testStatus');
  };

  Template.parent.events({
    'click #openTab': function () {
      window.open('/child');
    },
    
    'click #runTest': function () {
      if (localStorage.getItem('ping') === '!' ||
          localStorage.getItem('pong') === '!') {
        Session.set('testStatus', 'Test already run.  Close the second tab (if open), refresh this page, and run again.');
      }
      else {
        localStorage.setItem('ping', '!');
      }
    }
  });

  if (isParent) {
    Session.set('testStatus', '');

    Meteor.startup(function () {
      localStorage.setItem('ping', null);
      localStorage.setItem('pong', null);
    });
    window.addEventListener('storage', function (event) {
      if (event.key === 'pong' && event.newValue === '!') {
        Session.set('testStatus', 'test successful');
      }
    });
  }

  if (isChild) {
    window.addEventListener('storage', function (event) {
      if (event.key === 'ping' && event.newValue === '!') {
        // If we used setTimeout here in iOS Safari it wouldn't
        // work (unless we switched tabs) because setTimeout and
        // setInterval events don't fire in inactive tabs.
        Meteor.defer(function () {
          localStorage.setItem('pong', '!');
        });
      }
    });
  }

}
