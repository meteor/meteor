import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { FirstUserAdminCollection } from '../roles_server';

const resetBootstrap = async () => {
  await Roles.config({});
  await Meteor.users.removeAsync({});
  await Meteor.roleAssignment.removeAsync({});
  await FirstUserAdminCollection.removeAsync({});
};

const withBootstrap = async run => {
  try {
    await resetBootstrap();
    await Roles.config({ adminRole: 'bootstrap-admin', addFirstUserAsAdmin: true });
    await run();
  } finally {
    await resetBootstrap();
    await Roles.config(Meteor.settings?.packages?.roles || {});
  }
};

Tinytest.addAsync('roles - one durable claim for concurrent password and OAuth signup', async test => {
  await withBootstrap(async () => {
    const [passwordId, external] = await Promise.all([
      Accounts.createUserAsync({ username: Random.id() }),
      Accounts.updateOrCreateUserFromExternalService('bootstrap-test', { id: Random.id() }),
    ]);
    const assigned = await Promise.all([passwordId, external.userId].map(id =>
      Roles.userIsInRoleAsync(id, 'bootstrap-admin')));
    test.equal(assigned.filter(Boolean).length, 1);
    const claim = await FirstUserAdminCollection.findOneAsync('first-user-admin');
    test.isTrue([passwordId, external.userId].includes(claim.userId));
    await Meteor.users.removeAsync({});
    const laterId = await Accounts.createUserAsync({ username: Random.id() });
    test.isFalse(await Roles.userIsInRoleAsync(laterId, 'bootstrap-admin'));
    test.equal((await FirstUserAdminCollection.findOneAsync('first-user-admin')).userId, claim.userId);
  });
});

Tinytest.addAsync('roles - external-service first signup receives the admin role', async test => {
  await withBootstrap(async () => {
    const { userId } = await Accounts.updateOrCreateUserFromExternalService('bootstrap-test', { id: Random.id() });
    test.isTrue(await Roles.userIsInRoleAsync(userId, 'bootstrap-admin'));
  });
});

Tinytest.addAsync('roles - enabling bootstrap with existing users grants no new admin', async test => {
  try {
    await resetBootstrap();
    const existingId = await Accounts.createUserAsync({ username: Random.id() });
    await Roles.config({ adminRole: 'bootstrap-admin', addFirstUserAsAdmin: true });
    const laterId = await Accounts.createUserAsync({ username: Random.id() });
    test.isFalse(await Roles.userIsInRoleAsync(laterId, 'bootstrap-admin'));
    test.equal((await FirstUserAdminCollection.findOneAsync('first-user-admin')).userId, existingId);
  } finally {
    await resetBootstrap();
    await Roles.config(Meteor.settings?.packages?.roles || {});
  }
});

Tinytest.addAsync('roles - external-service role failure rolls back the inserted user', async test => {
  const serviceId = Random.id();
  await test.throwsAsync(() => Accounts.updateOrCreateUserFromExternalService(
    'bootstrap-test', { id: serviceId }, { role: 'missing-role-' + Random.id() },
  ));
  test.isFalse(!!await Meteor.users.findOneAsync({ 'services.bootstrap-test.id': serviceId }));
});

Tinytest.addAsync('roles - bootstrap failures propagate and retain the claim', async test => {
  await withBootstrap(async () => {
    const original = Roles.addUsersToRolesAsync;
    Roles.addUsersToRolesAsync = async () => { throw new Error('assignment failed'); };
    try {
      await test.throwsAsync(() => Accounts.createUserAsync({ username: 'failed-' + Random.id() }), /assignment failed/);
    } finally {
      Roles.addUsersToRolesAsync = original;
    }
    const claim = await FirstUserAdminCollection.findOneAsync('first-user-admin');
    test.isTrue(!!await Meteor.users.findOneAsync(claim.userId));
    const laterId = await Accounts.createUserAsync({ username: Random.id() });
    test.isFalse(await Roles.userIsInRoleAsync(laterId, 'bootstrap-admin'));
  });
});

Tinytest.addAsync('roles - configuration failures propagate', async test => {
  const original = Roles.createRoleAsync;
  Roles.createRoleAsync = async () => { throw new Error('creation failed'); };
  try {
    await test.throwsAsync(() => Roles.config({ adminRole: 'broken' }), /creation failed/);
  } finally {
    Roles.createRoleAsync = original;
  }
});
