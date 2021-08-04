// Hold collections instances to avoid duplications
const collectionsInstances = {};

// Avoid initializing multiple collections with replica, mutation methods and
// auto publish
const collectionsStatusByName = {};

export const markCollectionAsInitializing = ({name}) => {
  collectionsStatusByName[name] = 'initializing';
}

const getScope = ({ name, namespace }) =>
  `${namespace ? `${namespace}__` : ''}${name}`;

const getCollectionInstancesByScope = ({
  name,
  options: { namespace } = {},
}) => {
  if (name === null) {
    return null;
  }
  const scope = getScope({ name, namespace });
  return collectionsInstances[scope];
};

export const getCollectionInstanceOrNull = ({
  name,
  options: { isAsync, namespace } = {},
}) => {
  const isAsyncBoolean = !!isAsync;
  const collectionsInstancesByScope = getCollectionInstancesByScope({
    name,
    options: { namespace },
  });
  if (collectionsInstancesByScope) {
    return collectionsInstancesByScope[isAsyncBoolean] || null;
  }
  return null;
};

export const hasCollectionStatus = ({
  name,
}) => {
  return !!collectionsStatusByName[name];
};

export const setCollectionInstance = ({
  name,
  instance,
  options: { isAsync, namespace } = {},
}) => {
  if (name === null) {
    return instance;
  }
  collectionsStatusByName[name] = 'initialized';

  const isAsyncBoolean = !!isAsync;

  const scope = getScope({ name, namespace });
  if (!collectionsInstances[scope]) {
    collectionsInstances[scope] = {};
  }

  if (collectionsInstances[scope][isAsyncBoolean]) {
    throw new Error(
      `There is already a collection named "${name}"${
        namespace ? ` namespace ${namespace}` : ''
      } is duplicated for type "${
        isAsyncBoolean ? 'async' : 'sync'
      }". Each collection can be defined only once for each type (async or sync).`
    );
  }

  collectionsInstances[scope][isAsyncBoolean] = instance;

  return instance;
};

