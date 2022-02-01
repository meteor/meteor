// we are mapping the new oplog format on mongo 5
// to what we know better, $set and $unset format
// new oplog format ex:
// {
//  '$v': 2,
//  diff: { u: { key1: 2022-01-06T18:23:16.131Z, key2: [ObjectID] } }
// }

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
  if (!Object.keys(possibleArrayOperator).length) return false;

  return !Object.keys(possibleArrayOperator).find(key => key !== 'a' && !key.match(/u\d+/));
};
const nestedOplogEntryParsers = (
  { i = {}, u = {}, d = {}, ...sFields },
  prefixKey = ''
) => {
  const sFieldsOperators = [];
  Object.entries(sFields).forEach(([key, value]) => {
    if (isArrayOperator(value || {})) {
      const { a, ...uPosition } = value;
      const [positionKey, newArrayIndexValue] = Object.entries(uPosition)[0];
      if (uPosition) {
        sFieldsOperators.push({
          [newArrayIndexValue === null ? '$unset' : '$set']: {
            [`${prefixKey}${key.substring(1)}.${positionKey.substring(1)}`]:
                newArrayIndexValue === null ? true : newArrayIndexValue,
          },
        });
      }else{
        throw new Error(`Unsupported oplog array entry, please review the input: ${JSON.stringify(value)}`)
      }
    } else {
      sFieldsOperators.push(
        nestedOplogEntryParsers(value, `${prefixKey}${key.substring(1)}.`)
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
      ...(!Array.isArray(setObjectSource[key]) && typeof setObjectSource[key] === 'object'
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
  return { $v: 2, ...nestedOplogEntryParsers(v2OplogEntry.diff || {}) };
};

function flattenObject(ob) {
  const toReturn = {};

  for (const i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if (typeof ob[i] == 'object' && ob[i] !== null) {
      const flatObject = flattenObject(ob[i]);
      for (const x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;

        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}
