import { Mongo } from 'meteor/mongo';
import { Buffer } from "node:buffer";

// Don't trigger an error on using node modules
//  as ignored to enable shared client/server code
console.log("Buffer loaded: ", !!Buffer);

export const LinksCollection = new Mongo.Collection('links');
