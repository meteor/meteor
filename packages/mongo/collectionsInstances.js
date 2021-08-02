// Hold collections instances to avoid duplications
const collectionsInstances = {};

const getScope = ({ name, namespace }) =>
  `${namespace ? `${namespace}__` : ''}${name}`;

export const getCollectionInstanceOrNull = ({
  name,
  options: { isAsync, namespace } = {},
}) => {
  const isAsyncBoolean = !!isAsync;
  const scope = getScope({name, namespace});
  const collectionsInstancesByScope = collectionsInstances[scope];
  if (collectionsInstancesByScope) {
    return collectionsInstancesByScope[isAsyncBoolean] || null;
  }
  return null;
};

export const setCollectionInstance = ({name, instance, options: {isAsync, namespace} = {}}) =>{
  const isAsyncBoolean = !!isAsync;

  const scope = getScope({name, namespace});
  if (!collectionsInstances[scope]) {
    collectionsInstances[scope] = {};
  }

  if (collectionsInstances[scope][isAsyncBoolean]) {
    throw new Error(`There is already a collection named "${name}"${namespace ? ` namespace ${namespace}` : ''} is duplicated for type "${isAsyncBoolean ? 'async' : 'sync'}". Each collection can be defined only once for each type (async or sync).`);
  }

  collectionsInstances[scope][isAsyncBoolean] = instance;

  return instance;
}
