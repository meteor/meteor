import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { OAuth } from 'meteor/oauth';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { Random } from 'meteor/random';

Accounts.oauth.registerService('fake');

Meteor.startup(async () => {
  await ServiceConfiguration.configurations.upsertAsync(
    { service: 'fake' },
    {
      $set: {
        service: 'fake',
        clientId: 'fake-client',
        secret: 'fake-secret',
        loginStyle: 'popup',
      },
    },
  );
});

export async function primeFakeOAuthCredential({ identity, email, profile }) {
  const credentialToken = Random.id();
  const credentialSecret = Random.secret();

  await OAuth._storePendingCredential(
    credentialToken,
    {
      serviceName: 'fake',
      serviceData: {
        id: identity,
        email,
        ...(profile ? { profile } : {}),
      },
      options: {
        profile: profile || { name: identity },
      },
    },
    credentialSecret,
  );

  return { credentialToken, credentialSecret };
}
