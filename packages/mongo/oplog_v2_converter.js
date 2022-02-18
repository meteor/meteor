// we are mapping the new oplog format on mongo 5
// to what we know better, $set and $unset format
// new oplog format ex:
// {
//  '$v': 2,
//  diff: { u: { key1: 2022-01-06T18:23:16.131Z, key2: [ObjectID] } }
// }

function logConverterCalls(oplogEntry, prefixKey, key) {
  if (!process.env.OPLOG_CONVERTER_DEBUG) {
    return;
  }
  console.log('Calling nestedOplogEntryParsers with the following values: ');
  console.log(
    `Oplog entry: ${JSON.stringify(
      oplogEntry
    )}, prefixKey: ${prefixKey}, key: ${key}`
  );
}

/*
the structure of an entry is:


-> entry: i, u, d + sFields.
-> sFields: i, u, d + sFields
-> sFields: arrayOperator -> { a: true, u0: 2 }
-> i,u,d: { key: value }
-> value: {key: value}

i and u are both $set
d is $unset
on mongo 4
 */

const isArrayOperator = possibleArrayOperator => {
  if (!possibleArrayOperator || !Object.keys(possibleArrayOperator).length)
    return false;

  if (!possibleArrayOperator.a) {
    return false;
  }
  return !Object.keys(possibleArrayOperator).find(
      key => key !== 'a' && !key.match(/^u\d+/)
  );
};
function logOplogEntryError(oplogEntry, prefixKey, key) {
  console.log('---');
  console.log(
    'WARNING: Unsupported oplog operation, please fill an issue with this message at github.com/meteor/meteor'
  );
  console.log(
    `Oplog entry: ${JSON.stringify(
      oplogEntry
    )}, prefixKey: ${prefixKey}, key: ${key}`
  );
  console.log('---');
}

const nestedOplogEntryParsers = (oplogEntry, prefixKey = '') => {
  const { i = {}, u = {}, d = {}, ...sFields } = oplogEntry;
  logConverterCalls(oplogEntry, prefixKey, 'ENTRY_POINT');
  const sFieldsOperators = [];
  Object.entries(sFields).forEach(([key, value]) => {
    const actualKeyNameWithoutSPrefix = key.substring(1);
    if (isArrayOperator(value || {})) {
      const { a, ...uPosition } = value;
      if (uPosition) {
        for (const [positionKey, newArrayIndexValue] of Object.entries(
          uPosition
        )) {
          sFieldsOperators.push({
            [newArrayIndexValue === null ? '$unset' : '$set']: {
              [`${prefixKey}${actualKeyNameWithoutSPrefix}.${positionKey.substring(
                1
              )}`]: newArrayIndexValue === null ? true : newArrayIndexValue,
            },
          });
        }
      } else {
        logOplogEntryError(oplogEntry, prefixKey, key);
        throw new Error(
          `Unsupported oplog array entry, please review the input: ${JSON.stringify(
            value
          )}`
        );
      }
    } else {
      // we are looking at something that we expected to be "sSomething" but is null after removing s
      // this happens on "a": true which is a simply ack that comes embeded
      // we dont need to call recursion on this case, only ignore it
      if (!actualKeyNameWithoutSPrefix || actualKeyNameWithoutSPrefix === '') {
        return null;
      }
      // we are looking at a "sSomething" that is actually a nested object set
      logConverterCalls(oplogEntry, prefixKey, key);
      sFieldsOperators.push(
        nestedOplogEntryParsers(
          value,
          `${prefixKey}${actualKeyNameWithoutSPrefix}.`
        )
      );
    }
  });
  const $unset = Object.keys(d).reduce((acc, key) => {
    return { ...acc, [`${prefixKey}${key}`]: true };
  }, {});
  const setObjectSource = { ...i, ...u };
  const $set = Object.keys(setObjectSource).reduce((acc, key) => {
    const prefixedKey = `${prefixKey}${key}`;
    return {
      ...acc,
      ...(!Array.isArray(setObjectSource[key]) &&
      typeof setObjectSource[key] === 'object'
        ? flattenObject({ [prefixedKey]: setObjectSource[key] })
        : {
            [prefixedKey]: setObjectSource[key],
          }),
    };
  }, {});

  const c = [...sFieldsOperators, { $unset, $set }];
  const { $set: s, $unset: un } = c.reduce(
    (acc, { $set: set = {}, $unset: unset = {} }) => {
      return {
        $set: { ...acc.$set, ...set },
        $unset: { ...acc.$unset, ...unset },
      };
    },
    {}
  );
  return {
    ...(Object.keys(s).length ? { $set: s } : {}),
    ...(Object.keys(un).length ? { $unset: un } : {}),
  };
};

export const oplogV2V1Converter = v2OplogEntry => {
  if (v2OplogEntry.$v !== 2 || !v2OplogEntry.diff) return v2OplogEntry;
  logConverterCalls(v2OplogEntry, 'INITIAL_CALL', 'INITIAL_CALL');
  return { $v: 2, ...nestedOplogEntryParsers(v2OplogEntry.diff || {}) };
};

function flattenObject(ob) {
  const toReturn = {};

  for (const i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if (!Array.isArray(ob[i]) && typeof ob[i] == 'object' && ob[i] !== null) {
      const flatObject = flattenObject(ob[i]);
      let objectKeys = Object.keys(flatObject);
      if (objectKeys.length === 0) {
        return ob;
      }
      for (const x of objectKeys) {
        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}
