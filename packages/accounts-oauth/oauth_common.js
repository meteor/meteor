import { Meteor } from 'meteor/meteor';

// TODO get from account-base
// config option keys
const VALID_CONFIG_KEYS = [
  'sendVerificationEmail',
  'forbidClientAccountCreation',
  'passwordEnrollTokenExpiration',
  'passwordEnrollTokenExpirationInDays',
  'restrictCreationByEmailDomain',
  'loginExpirationInDays',
  'loginExpiration',
  'passwordResetTokenExpirationInDays',
  'passwordResetTokenExpiration',
  'ambiguousErrorMessages',
  'bcryptRounds',
  'defaultFieldSelector',
  'loginTokenExpirationHours',
  'tokenSequenceLength',
];

Accounts.oauth = {};

const services = {};
const hasOwn = Object.prototype.hasOwnProperty;

// Helper for registering OAuth based accounts packages.
// On the server, adds an index to the user collection.
Accounts.oauth.registerService = name => {
  if (hasOwn.call(services, name))
    throw new Error(`Duplicate service: ${name}`);
  services[name] = true;

  if (Meteor.server) {
    // Accounts.updateOrCreateUserFromExternalService does a lookup by this id,
    // so this should be a unique index. You might want to add indexes for other
    // fields returned by your service (eg services.github.login) but you can do
    // that in your app.
    Meteor.users.createIndexAsync(`services.${name}.id`, {unique: true, sparse: true});
  }
};

// Removes a previously registered service.
// This will disable logging in with this service, and serviceNames() will not
// contain it.
// It's worth noting that already logged in users will remain logged in unless
// you manually expire their sessions.
Accounts.oauth.unregisterService = name => {
  if (!hasOwn.call(services, name))
    throw new Error(`Service not found: ${name}`);
  delete services[name];
};

Accounts.oauth.serviceNames = () => Object.keys(services);

// loginServiceConfiguration and ConfigError are maintained for backwards compatibility
Meteor.startup(() => {
  const { ServiceConfiguration } = Package['service-configuration'];
  Accounts.loginServiceConfiguration = ServiceConfiguration.configurations;
  Accounts.ConfigError = ServiceConfiguration.ConfigError;

  const settings = Meteor.settings?.packages?.['accounts-base'];
  if (settings) {
    if (settings.oauthSecretKey) {
      if (!Package['oauth-encryption']) {
        throw new Error(
          'The oauth-encryption package must be loaded to set oauthSecretKey'
        );
      }
      Package['oauth-encryption'].OAuthEncryption.loadKey(
        settings.oauthSecretKey
      );
      delete settings.oauthSecretKey;
    }
    // Validate config options keys
    Object.keys(settings).forEach(key => {
      if (!VALID_CONFIG_KEYS.includes(key)) {
        // TODO Consider just logging a debug message instead to allow for additional keys in the settings here?
        throw new Meteor.Error(
          `Accounts configuration: Invalid key: ${key}`
        );
      } else {
        // set values in Accounts._options
        Accounts._options[key] = settings[key];
      }
    });
  }
});
