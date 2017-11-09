import { DDPCommon } from 'meteor/ddp-common';
import { Meteor } from 'meteor/meteor';

/**
 * @namespace DDP
 * @summary Namespace for DDP-related methods/classes.
 */
export const DDP = {};
export const LivedataTest = {};

LivedataTest.SUPPORTED_DDP_VERSIONS = DDPCommon.SUPPORTED_DDP_VERSIONS;

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
