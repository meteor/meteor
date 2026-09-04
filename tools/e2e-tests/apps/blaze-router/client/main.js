import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import {
  RouteController,
  Router,
} from 'meteor/vlasky:galvanized-iron-router';

import './main.css';
import './main.html';

window.__CLIENT_BOOTED__ = true;
window.__ROUTE_HOOK_SECTION__ = null;

Router.configure({
  layoutTemplate: 'appLayout',
  notFoundTemplate: 'notFound',
});

Router.route('/', {
  name: 'home',
  action() {
    this.render('home');
  },
});

const ItemController = RouteController.extend({
  data() {
    return {
      itemId: this.params.itemId,
      filter: this.params.query.filter,
      hash: this.params.hash,
    };
  },
  action() {
    this.render('item');
  },
});

Router.registerController('ItemController', ItemController);
Router.route('/items/:itemId', {
  name: 'item.detail',
  controller: 'ItemController',
});

Router.onBeforeAction(function routeSectionHook() {
  window.__ROUTE_HOOK_SECTION__ = this.params.section;
  this.next();
}, {
  only: ['guarded'],
});

Router.route('/guarded/:section', {
  name: 'guarded',
  data() {
    return { section: this.params.section };
  },
  action() {
    this.render('guarded');
  },
});

Template.home.helpers({
  greeting: () => 'client booted',
});

if (Meteor.isAppTest) {
  describe('client boot', () => {
    it('loads the Rspack client bundle', () => {
      if (window.__CLIENT_BOOTED__ !== true) {
        throw new Error('Rspack client bundle did not boot');
      }
    });

    it('registers the Router route matrix', () => {
      const routeNames = ['home', 'item.detail', 'guarded'];
      if (!routeNames.every(name => Router.routes[name])) {
        throw new Error('Router route matrix was not registered');
      }
    });
  });
}
