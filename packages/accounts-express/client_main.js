import { Meteor } from 'meteor/meteor';
import { createAuthFetch } from './fetch_client.js';

// Wrap the base Meteor.fetch with auth functionality
Meteor.fetch = createAuthFetch(Meteor.fetch);

export { createAuthFetch };
