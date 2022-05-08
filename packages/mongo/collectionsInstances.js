// Hold collections instances to avoid duplications
const collectionsInstances = {};

// Avoid initializing multiple collections with replica, mutation methods and
// auto publish
const collectionsStatusByName = {};

export const markCollectionAsInitializing = ({ name }) => {
  if (name === null) {
    return;
  }

  collectionsStatusByName[name] = 'initializing';
};

export const hasCollectionStatus = ({ name }) => {
  if (name === null) {
    return false;
  }

  return !!collectionsStatusByName[name];
};

const getScope = ({ name }) => name;

const getCollectionInstancesByScope = ({
  name,
}) => {
  if (name === null) {
    return null;
  }

  const scope = getScope({ name });
  return collectionsInstances[scope];
};

export const getCollectionInstanceOrNull = ({
  name,
  options: { isAsync } = {},
}) => {
  const isAsyncBoolean = !!isAsync;
  const collectionsInstancesByScope = getCollectionInstancesByScope({ name });
  return collectionsInstancesByScope?.[isAsyncBoolean] ?? null;
};

export const setCollectionInstance = ({
  name,
  instance,
  options: { isAsync } = {},
}) => {
  if (name === null) {
    return instance;
  }

  collectionsStatusByName[name] = 'initialized';

  const scope = getScope({ name });
  if (!collectionsInstances[scope]) {
    collectionsInstances[scope] = {};
  }

  // this is not going to happen unless we have an error in our internal code
  // we try to always return the same instance if the user create two instances
  // of the same name and type (async / sync)
  const isAsyncBoolean = !!isAsync;
  if (collectionsInstances[scope][isAsyncBoolean]) {
    throw new Error(
      `There is already a collection named "${name}" for type "${
        isAsyncBoolean ? 'async' : 'sync'
      }". Each collection can be defined only once for each type (async or sync).`
    );
  }

  collectionsInstances[scope][isAsyncBoolean] = instance;

  return instance;
};
