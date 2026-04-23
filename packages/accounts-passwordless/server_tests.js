import { Random } from 'meteor/random';
import { checkToken } from './server_utils';
import { SHA256 } from 'meteor/sha';

const USER_TOKEN = '123ABC';

const getData = async ({ createdAt }) => {
  const userId = Random.id();
  const email = `${userId}@meteorapp.com`;

  const idToken = await SHA256(userId + USER_TOKEN);
  const emailToken = await SHA256(email + USER_TOKEN);

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

Tinytest.addAsync('passwordless - time expired', async (test) => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 14:01:00');

  const { user } = await getData({ createdAt });

  const result = await checkToken({
    user,
    sequence: USER_TOKEN,
    selector: { email: user.email },
    currentDate,
  });

  test.isTrue(!!result.error);
  test.equal(result.error.reason, 'Expired token');
});

Tinytest.addAsync('passwordless - Email and token mismatch', async (test) => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = await getData({ createdAt });

  // Email mismatch
  const resultEmail = await checkToken({
    user,
    sequence: USER_TOKEN,
    selector: { email: 'invalid@email.com' },
    currentDate,
  });

  test.isTrue(!!resultEmail.error);
  test.equal(resultEmail.error.reason, 'Email or token mismatch');
  // Token mismatch
  const resultToken = await checkToken({
    user,
    sequence: 'ABC321',
    selector: { email: user.email },
    currentDate,
  });

  test.isTrue(!!resultToken.error);
  test.equal(resultToken.error.reason, 'Email or token mismatch');
});

Tinytest.addAsync('passwordless - Token mismatch', async (test) => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = await getData({ createdAt });

  const result = await checkToken({
    user,
    sequence: 'AAA111',
    selector: {},
    currentDate,
  });

  test.isTrue(!!result.error);
  test.equal(result.error.reason, 'Token mismatch');
});

Tinytest.addAsync('passwordless - Valid token with email', async (test) => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = await getData({ createdAt });

  const result = await checkToken({
    user,
    sequence: USER_TOKEN,
    selector: { email: user.email },
    currentDate,
  });

  test.isFalse(!!result.error);
});

Tinytest.addAsync('passwordless - Valid token without email', async (test) => {
  const createdAt = new Date('July 17, 2022 13:00:00');
  const currentDate = new Date('July 17, 2022 13:05:00');

  const { user } = await getData({ createdAt });

  const result = await checkToken({
    user,
    sequence: USER_TOKEN,
    selector: {},
    currentDate,
  });

  test.isFalse(!!result.error);
});
