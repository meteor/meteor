import { Meteor } from 'meteor/meteor';
import { meteorFetch } from './fetch_client.js';

Meteor.fetch = meteorFetch;

export { meteorFetch };
