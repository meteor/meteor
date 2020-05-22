import React from 'react';
import {Accounts} from "meteor/accounts-base";
import {Meteor} from "meteor/meteor";
import {useTracker} from 'meteor/react-meteor-data';

const USERNAME = 'test@mobile.meteorapp.com';
const PASSWORD = '123456';

export const User = () => {
  const user = useTracker(() => Meteor.user());
  const createUser = () => {
    Accounts.createUser(
      {
        username: USERNAME,
        email: USERNAME,
        password: PASSWORD,
      },
      error => {
        if (error) {
          console.error(`Error creating user ${USERNAME}`, error);
          return;
        }

        console.log(`${USERNAME} created`);
      }
    );
  };

  const loginUser = () => {
    Meteor.loginWithPassword(
      USERNAME,
      PASSWORD,
      error => {
        if (!error) {
          console.log(`User authenticated ${USERNAME}`);
          return;
        }

        if (error.error === 403) {
          console.warn(`User not found`, error);
          return;
        }

        console.error(`Error authenticating user ${USERNAME}`, error);
      }
    );
  };

  const logoutUser = () => {
    Meteor.logout(() => console.log(`User logged out ${USERNAME}`));
  };

  return (
    <div>
      {!user && <>
        <button onClick={createUser}>Create user</button>
        <button onClick={loginUser}>Login user</button>
      </>}
      {user && <>
        <button onClick={logoutUser}>Logout {user.username}</button>
      </>}
    </div>
  );
};
