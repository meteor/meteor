import { expectTypeOf } from 'expect-type';
import { Accounts } from './accounts-base.native';

expectTypeOf(Accounts.createApiTokenAsync('user-id', {
  name: 'ci reports',
  expiresAt: new Date(),
  scopes: ['reports:read'],
})).toEqualTypeOf<Promise<Accounts.CreatedApiToken>>();

Accounts.createApiTokenAsync('user-id', { name: 'integration', expiresAt: null });
Accounts.createApiTokenAsync('user-id', { name: 'integration', expiresAt: null, scopes: null });
Accounts.createApiTokenAsync('user-id', { name: 'integration', expiresAt: null, scopes: [] });

// @ts-expect-error A lifetime must be chosen explicitly.
Accounts.createApiTokenAsync('user-id', { name: 'integration' });
// @ts-expect-error Expiry is a Date or null, not a session lifetime in days.
Accounts.createApiTokenAsync('user-id', { name: 'integration', expiresAt: 30 });
// @ts-expect-error Scopes are a list of application-defined names.
Accounts.createApiTokenAsync('user-id', { name: 'integration', expiresAt: null, scopes: 'reports:read' });

expectTypeOf(Accounts.listApiTokensAsync('user-id')).toEqualTypeOf<Promise<Accounts.ApiToken[]>>();
expectTypeOf(Accounts.revokeApiTokenAsync('user-id', 'token-id')).toEqualTypeOf<Promise<boolean>>();
expectTypeOf(Accounts.revokeAllApiTokensAsync('user-id')).toEqualTypeOf<Promise<void>>();

declare const metadata: Accounts.ApiToken;
expectTypeOf(metadata.expiresAt).toEqualTypeOf<Date | null>();
expectTypeOf(metadata.scopes).toEqualTypeOf<string[] | null>();
// @ts-expect-error Listing credentials must not expose their secret.
expectTypeOf(metadata.token);
// @ts-expect-error Listing credentials must not expose their stored hash.
expectTypeOf(metadata.hashedToken);

declare const issued: Accounts.CreatedApiToken;
expectTypeOf(issued.token).toBeString();
