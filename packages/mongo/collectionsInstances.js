// Hold collections instances to avoid duplications
const collectionsInstances = {};

export const getCollectionInstanceOrNull = ({name, isAsync}) => {
  const isAsyncBoolean = !!isAsync;
  const collectionsInstancesByName = collectionsInstances[name];
  if (collectionsInstancesByName) {
    return collectionsInstancesByName[isAsyncBoolean] || null;
  }
  return null;
}

export const setCollectionInstance = ({name, isAsync, instance}) =>{
  const isAsyncBoolean = !!isAsync;

  if (!collectionsInstances[name]) {
    collectionsInstances[name] = {};
  }

  if (collectionsInstances[name][isAsyncBoolean]) {
    throw new Error(`There is already a collection named "${name}" is duplicated for type "${isAsyncBoolean ? 'async' : 'sync'}". Each collection can be defined only once for each type (async or sync).`);
  }

  collectionsInstances[name][isAsyncBoolean] = instance;

  return instance;
}
