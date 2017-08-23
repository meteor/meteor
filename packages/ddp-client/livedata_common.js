import { DDP, LivedataTest } from "./namespace.js";

LivedataTest.SUPPORTED_DDP_VERSIONS = DDPCommon.SUPPORTED_DDP_VERSIONS;

// This is private but it's used in a few places. accounts-base uses
// it to get the current user. Meteor.setTimeout and friends clear
// it. We can probably find a better way to factor this.
DDP._CurrentMethodInvocation = new Meteor.EnvironmentVariable;
DDP._CurrentPublicationInvocation = new Meteor.EnvironmentVariable;

// XXX: Keep DDP._CurrentInvocation for backwards-compatibility.
DDP._CurrentInvocation = DDP._CurrentMethodInvocation;
