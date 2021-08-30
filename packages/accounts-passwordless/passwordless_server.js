import { Accounts } from 'meteor/accounts-base';
import {
  handleError,
  tokenValidator,
  userQueryValidator,
} from './server_utils';

Accounts._checkToken = ({ user, token }) => {
  const result = {
    userId: user._id,
  };

  const userStoredToken = user.services.passwordless.token;
  const { createdAt, sequence } = userStoredToken;

  if(new Date(createdAt.getTime() + (Accounts._options.loginTokenExpirationHours*60*60*1000)) >= new Date()){
    result.error = handleError("Expired token", false);
  }
  if(sequence !== token){
    result.error = handleError("Sequence not found", false);
  }

  return result;
};
const checkToken = Accounts._checkToken;

// Handler to login with an ott.
Accounts.registerLoginHandler('passwordless', options => {
  if (!options.token) return undefined; // don't handle

  check(options, {
    user: userQueryValidator,
    token: tokenValidator(),
  });

  const user = Accounts._findUserByQuery(options.user, {
    fields: {
      services: 1,
    },
  });
  if (!user) {
    handleError('User not found');
  }

  if (
    !user.services ||
    !user.services.passwordless ||
    !user.services.passwordless.token
  ) {
    handleError('User has no token set');
  }

  return checkToken({ ...options, user });
});
