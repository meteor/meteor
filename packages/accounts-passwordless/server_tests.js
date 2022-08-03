import { Random } from 'meteor/random';
import { checkToken } from './server_utils';
import { SHA256 } from 'meteor/sha';

const USER_TOKEN = '123ABC';

const getData = ({ createdAt }) => {
  const userId = Random.id();
  const email = `${userId}@meteorapp.com`;

  const idToken = SHA256(userId + USER_TOKEN);
  const emailToken = SHA256(email + USER_TOKEN);

  const user = {
    _id: userId,
    email,
    services: {
      passwordless: {
        createdAt,
        tokens: [{ email, token: emailToken }],
        token: idToken,
      },
    },
  };
  return {
    user,
  };
};

Tinytest.add('passwordless - time expired', test => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 14:01:00');

  const { user } = getData({ createdAt });

  const result = checkToken({
    user,
    sequence: USER_TOKEN,
    selector: { email: user.email },
    currentDate,
  });

  test.isTrue(!!result.error);
  test.equal(result.error.reason, 'Expired token');
});

Tinytest.add('passwordless - Email and token mismatch', test => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = getData({ createdAt });

  // Email mismatch
  const resultEmail = checkToken({
    user,
    sequence: USER_TOKEN,
    selector: { email: 'invalid@email.com' },
    currentDate,
  });

  test.isTrue(!!resultEmail.error);
  test.equal(resultEmail.error.reason, 'Email or token mismatch');
  // Token mismatch
  const resultToken = checkToken({
    user,
    sequence: 'ABC321',
    selector: { email: user.email },
    currentDate,
  });

  test.isTrue(!!resultToken.error);
  test.equal(resultToken.error.reason, 'Email or token mismatch');
});

Tinytest.add('passwordless - Token mismatch', test => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = getData({ createdAt });

  const result = checkToken({
    user,
    sequence: 'AAA111',
    selector: {},
    currentDate,
  });

  test.isTrue(!!result.error);
  test.equal(result.error.reason, 'Token mismatch');
});

Tinytest.add('passwordless - Valid token with email', test => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = getData({ createdAt });

  const result = checkToken({
    user,
    sequence: USER_TOKEN,
    selector: { email: user.email },
    currentDate,
  });

  test.isFalse(!!result.error);
});

Tinytest.add('passwordless - Valid token without email', test => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = getData({ createdAt });

  const result = checkToken({
    user,
    sequence: USER_TOKEN,
    selector: {},
    currentDate,
  });

  test.isFalse(!!result.error);
});
