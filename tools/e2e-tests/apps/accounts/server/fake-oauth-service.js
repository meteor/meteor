import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { OAuth } from 'meteor/oauth';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { Random } from 'meteor/random';

Accounts.oauth.registerService('fake');

const PROVIDER_SERVICES = [
  'fake',
  'facebook',
  'github',
  'google',
  'meetup',
  'meteor-developer',
  'twitter',
  'weibo',
];

Meteor.startup(async () => {
  for (const service of PROVIDER_SERVICES) {
    await ServiceConfiguration.configurations.upsertAsync(
      { service },
      {
        $set: {
          service,
          clientId: `fake-${service}-client`,
          secret: `fake-${service}-secret`,
          loginStyle: 'popup',
        },
      },
    );
  }
});

export async function primeFakeOAuthCredential({ identity, email, profile }) {
  return primeOAuthCredential({
    serviceName: 'fake',
    serviceData: {
      id: identity,
      email,
      ...(profile ? { profile } : {}),
    },
    options: { profile: profile || { name: identity } },
  });
}

export async function primeOAuthCredential({ serviceName, serviceData, options }) {
  const credentialToken = Random.id();
  const credentialSecret = Random.secret();

  await OAuth._storePendingCredential(
    credentialToken,
    {
      serviceName,
      serviceData,
      options: options || {},
    },
    credentialSecret,
  );

  return { credentialToken, credentialSecret };
}
