Stellar = {};
Stellar._controllers = {};
Stellar.client = {};
Stellar.page = {};
Stellar.loaded = false;

Stellar.client.init = function() {
  if(Meteor.is_client) {
    Stellar.log('Init');
    Meteor.startup(function() {

      //TODO this is a hack to solve execution order issue
      if(!Stellar.action_exists()) {
        Stellar.log('Call setPage again');
        Stellar.page.set(Stellar.page._controller, Stellar.page._action);
      }

      Stellar.loaded = true;
      //Call controllers when everything exists
      Stellar.page.call();

      Stellar.client.linkHandler();
    });
  }
}

Stellar.client.linkHandler = function() {
  $('body').on('click', 'a', function(e){
    link = $(this).attr('href');
    if(!link.match(/^(?:https?|mailto):\/\/.*/)) {
      e.preventDefault();
      Stellar.log('Link clicked');
      Stellar.redirect(link);
    }
  });
}

Stellar.redirect = function(link) {
  Stellar.navigate(link, true);
}

Stellar.client.registerHelper = function(name, func) {
  if(Meteor.is_client) {
    Handlebars.registerHelper(name, func);
  }
};

Stellar.navigate = function(path, load) {
  Stellar.log('Navigate to:' + path);
  Stellar.logPageLoad(path);
  Router.navigate(path, load);
};

Stellar.render = function(template, properties) {
  Stellar.log('Render called: ');
  Stellar.log(template);
  if(properties) {
    _.each(properties, function(property, key) {
      Stellar.log(key);
      Stellar.log(property);
      Template[template][key] = property;
    });
  }
  Stellar.page.template = template;
  Stellar.page.context.invalidate();
};

Stellar.logPageLoad = function(path) {
  $(window).trigger('stellar_page_load', [path]);
};

//This will allow us to turn logs off quicker
Stellar.log = function(message) {
  if(console && console.log) {
    console.log(message);
  }
}

Stellar.Controller = function(name) {
  self = this;
  Stellar._controllers[name] = self;
};

Stellar.Collection = function(name, manager, driver) {
  collection = new Meteor.Collection(name, manager, driver);
  if(Meteor.is_server) {
    Meteor.startup(function () {
      _.each(['insert', 'update', 'remove'], function(method) {
        Meteor.default_server.method_handlers['/' + name + '/' + method] = function() {};
      });
    });
  }
  return collection;
};

Stellar.page.set = function(controller, action) {
  //TODO make this whole method more flexible
  Stellar.page._controller = controller;
  Stellar.page._action = action;

  Stellar.page.controller = controller;

  if(!action) {
    action = 'index';
  }

  params = {};
  if(action.indexOf('?') !== -1) {
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++) {
      var hash = hashes[i].split('=');
      params[hash[0]] = hash[1];
    }

    action = action.slice(0, action.indexOf('?'));
  }

  actionBits = action.split('#');
  action = actionBits[0];
  if(actionBits[1]) {
    params['hash'] = actionBits[1];
  }

  Stellar.page.params = params;
  Stellar.page.action = action;

  //Check for controller, if it exists check for that action
  //If it doesn't exist look for a show action instead
  if(Stellar._controllers[controller]) {
    if(!Stellar.action_exists() && Stellar._controllers[controller]['show']) {
      Stellar.page.params['show'] = action;
      Stellar.page.action = 'show';
    }
  }

  if(Stellar.loaded === true) {
    Stellar.page.call();
  }
};

Stellar.action_exists = function() {
  if(Stellar._controllers[Stellar.page.controller] && Stellar._controllers[Stellar.page.controller][Stellar.page.action]) {
    return true;
  }
  return false;
};

Stellar.page.call = function() {
  Stellar.log('Call');
  Stellar.log(Stellar.page);
  if(Stellar._controllers[Stellar.page.controller]) { //TODO fix missing error
    Stellar.log('Controller');
    controllerObj = Stellar._controllers[Stellar.page.controller];
    if(controllerObj[Stellar.page.action]) {
      Stellar.log('Action');
      controllerObj[Stellar.page.action]();
    }
  }
};

Stellar.client.registerHelper('stellar_page', function() {
  Stellar.log('Content helper');
  var context = Meteor.deps.Context.current;
  if(context && !Stellar.page.context) {
    Stellar.page.context = context;
    context.on_invalidate(function() {
      Stellar.log('invalidate');
      Stellar.page.context = null;
    });
  }

  if(Stellar.loaded) {
    if(Template[Stellar.page.template]) {
      Stellar.log('Load new page');
      return Meteor.ui.chunk(function() { return Template[Stellar.page.template]();});
    } else {
      throw new Meteor.Error('404', 'Page not found');
    }
    return '';
  }
  Stellar.log(Stellar.page);
  Stellar.log('Show nowt');
  return '';
});

if(Meteor.is_client) {
  //This needs to be called so all the controllers are initialised
  $(window).load(function() {
    Stellar.client.init();
  });

  StellarRouter = Backbone.Router.extend({
    routes: {
      ":controller/:action": "actionPage",
      ":contoller/:action/": "actionPage",
      "/": "homePage",
      "": "homePage",
      ":controller": "basicPage",
      ":controller/": "basicPage",
    },
    homePage: function() {
      Stellar.page.set('home');
    },
    basicPage: function(controller) {
      Stellar.page.set(controller);
    },
    actionPage: function(controller, action) {
      Stellar.page.set(controller, action);
    }
  });
  Router = new StellarRouter;

  Backbone.history.start({pushState: true});
}