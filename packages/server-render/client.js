import { Meteor } from "meteor/meteor";
import { ClientSink } from "./client-sink.js";

let promise = new Promise(Meteor.startup);
let sink = new ClientSink();

export function onPageLoad(callback) {
  promise = promise.then(() => callback(sink));
}
