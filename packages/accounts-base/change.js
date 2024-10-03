// server.js
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { UsersDB } from '../../api/collections/users/server/users'; // Adjust path as necessary

Meteor.startup(() => {
  // Configure Accounts to use the UsersDB collection
  Accounts.config({
    loginExpirationInDays: process.env.LOGIN_EXPIRATION_IN_DAYS || 30,
    sendVerificationEmail: false,
    collection: UsersDB,
  });

  // Clear the collection on startup (Uncomment if you want to clear existing data)
  // UsersDB.remove({}); // Clear existing users

  // Optionally, initialize with some default users
  const defaultUsers = [
    { username: 'admin', password: 'admin123' },
    { username: 'user1', password: 'user123' },
    { username: 'user2', password: 'user456' },
  ];

  defaultUsers.forEach(({ username, password }) => {
    // Check if user already exists before creating
    if (!UsersDB.findOne({ username })) {
      Accounts.createUser({ username, password });
      console.log(`Created user: ${username}`);
    } else {
      console.log(`User already exists: ${username}`);
    }
  });
});
