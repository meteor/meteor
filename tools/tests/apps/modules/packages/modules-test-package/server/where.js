import { Meteor } from "meteor/meteor";
export const where = Meteor.isServer ? "server" : "client";
