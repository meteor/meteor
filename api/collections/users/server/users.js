// api/collections/users/server/users.js
import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

// Define the UsersDB collection
export const UsersDB = new Mongo.Collection('users');

// Define methods for managing users
Meteor.methods({
  'users.create'(username, password) {
    // Create a new user
    const userId = Accounts.createUser({ username, password });
    return userId;
  },
  // Add more methods as needed
});
