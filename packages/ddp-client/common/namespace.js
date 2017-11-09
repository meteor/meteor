import { DDPCommon } from 'meteor/ddp-common';
import { Meteor } from 'meteor/meteor';

import { Connection } from './livedata_connection';

/**
 * @namespace DDP
 * @summary Namespace for DDP-related methods/classes.
 */
export const DDP = {};
export const LivedataTest = {
  Connection
};

// This is private but it's used in a few places. accounts-base uses
// it to get the current user. Meteor.setTimeout and friends clear
// it. We can probably find a better way to factor this.
DDP._CurrentMethodInvocation = new Meteor.EnvironmentVariable();
DDP._CurrentPublicationInvocation = new Meteor.EnvironmentVariable();

// XXX: Keep DDP._CurrentInvocation for backwards-compatibility.
DDP._CurrentInvocation = DDP._CurrentMethodInvocation;

DDP.ConnectionError = Meteor.makeErrorType('DDP.ConnectionError', function(
  message
) {
  var self = this;
  self.message = message;
});

DDP.ForcedReconnectError = Meteor.makeErrorType(
  'DDP.ForcedReconnectError',
  function() {}
);

// Returns the named sequence of pseudo-random values.
// The scope will be DDP._CurrentMethodInvocation.get(), so the stream will produce
// consistent values for method calls on the client and server.
DDP.randomStream = function(name) {
  var scope = DDP._CurrentMethodInvocation.get();
  return DDPCommon.RandomStream.get(scope, name);
};

// @param url {String} URL to Meteor app,
//     e.g.:
//     "subdomain.meteor.com",
//     "http://subdomain.meteor.com",
//     "/",
//     "ddp+sockjs://ddp--****-foo.meteor.com/sockjs"

/**
 * @summary Connect to the server of a different Meteor application to subscribe to its document sets and invoke its remote methods.
 * @locus Anywhere
 * @param {String} url The URL of another Meteor application.
 */
DDP.connect = function(url, options) {
  var ret = new Connection(url, options);
  allConnections.push(ret); // hack. see below.
  return ret;
};

DDP._reconnectHook = new Hook({ bindEnvironment: false });

/**
 * @summary Register a function to call as the first step of
 * reconnecting. This function can call methods which will be executed before
 * any other outstanding methods. For example, this can be used to re-establish
 * the appropriate authentication context on the connection.
 * @locus Anywhere
 * @param {Function} callback The function to call. It will be called with a
 * single argument, the [connection object](#ddp_connect) that is reconnecting.
 */
DDP.onReconnect = function(callback) {
  return DDP._reconnectHook.register(callback);
};

// Hack for `spiderable` package: a way to see if the page is done
// loading all the data it needs.
//
allConnections = [];
DDP._allSubscriptionsReady = function() {
  return _.all(allConnections, function(conn) {
    return _.all(conn._subscriptions, function(sub) {
      return sub.ready;
    });
  });
};
