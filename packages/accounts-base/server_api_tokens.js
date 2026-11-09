import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { check, Match } from 'meteor/check';

const API_TOKEN_PREFIX = 'meteor_api_';
const isNonBlankString = value => typeof value === 'string' && value.trim().length > 0;
const nonBlankString = Match.Where(isNonBlankString);

const tokenMetadata = ({ id, name, createdAt, expiresAt, scopes }) => ({
  id,
  name,
  createdAt,
  expiresAt,
  scopes,
});

export async function createApiTokenAsync(accounts, userId, options) {
  check(userId, Match.NonEmptyString);
  check(options, {
    name: nonBlankString,
    expiresAt: Match.OneOf(Date, null),
    scopes: Match.Optional(Match.OneOf(null, [nonBlankString])),
  });
  if (options.expiresAt !== null && (
    !Number.isFinite(options.expiresAt.getTime()) ||
    options.expiresAt.getTime() <= Date.now()
  )) {
    throw new Meteor.Error(400, 'API token expiration must be a future date or null');
  }

  const token = `${API_TOKEN_PREFIX}${Random.secret()}`;
  const storedToken = {
    id: Random.id(),
    name: options.name,
    createdAt: new Date(),
    expiresAt: options.expiresAt === null ? null : new Date(options.expiresAt.getTime()),
    scopes: options.scopes == null ? null : [...options.scopes],
    hashedToken: accounts._hashLoginToken(token),
  };
  const updated = await accounts.users.updateAsync(userId, {
    $push: { 'services.apiTokens': storedToken },
  });
  if (!updated) throw new Meteor.Error(404, 'User not found');

  return { ...tokenMetadata(storedToken), token };
}

export async function listApiTokensAsync(accounts, userId) {
  check(userId, Match.NonEmptyString);
  const user = await accounts.users.findOneAsync(userId, {
    fields: { 'services.apiTokens': 1 },
  });
  const tokens = user?.services?.apiTokens;
  return Array.isArray(tokens)
    ? tokens.filter(token => typeof token?.id === 'string' && token.id).map(tokenMetadata)
    : [];
}

export async function revokeApiTokenAsync(accounts, userId, tokenId) {
  check(userId, Match.NonEmptyString);
  check(tokenId, Match.NonEmptyString);
  const updated = await accounts.users.updateAsync(
    { _id: userId, 'services.apiTokens.id': tokenId },
    { $pull: { 'services.apiTokens': { id: tokenId } } }
  );
  return updated > 0;
}

export async function revokeAllApiTokensAsync(accounts, userId) {
  check(userId, Match.NonEmptyString);
  await accounts.users.updateAsync(userId, { $unset: { 'services.apiTokens': 1 } });
}

export async function findApiToken(accounts, token) {
  if (typeof token !== 'string' || !token.startsWith(API_TOKEN_PREFIX)) return null;

  const hashedToken = accounts._hashLoginToken(token);
  const user = await accounts.users.findOneAsync(
    { 'services.apiTokens.hashedToken': hashedToken },
    { fields: { 'services.apiTokens': 1 } }
  );
  const tokens = user?.services?.apiTokens;
  const storedToken = Array.isArray(tokens) && tokens.find(entry => entry?.hashedToken === hashedToken);
  if (!storedToken || typeof storedToken.id !== 'string' || !storedToken.id) return null;

  const { id, scopes, expiresAt } = storedToken;
  // Only an explicit null grants an unlimited lifetime or unrestricted scopes.
  // Missing or malformed stored values must not broaden a token's authority.
  if (expiresAt !== null && (
    !(expiresAt instanceof Date) ||
    !Number.isFinite(expiresAt.getTime()) ||
    Date.now() >= expiresAt.getTime()
  )) return null;
  if (scopes !== null && (
    !Array.isArray(scopes) ||
    !scopes.every(isNonBlankString)
  )) return null;

  return { userId: user._id, id, scopes, expiresAt };
}
