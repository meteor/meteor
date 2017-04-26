// Make sure field names do not contain Mongo restricted
// characters ('.', '$', '\0').
// https://docs.mongodb.com/manual/reference/limits/#Restrictions-on-Field-Names
const invalidCharMsg = {
  '.': "contain '.'",
  '$': "start with '$'",
  '\0': "contain null bytes",
};
export function assertIsValidFieldName(key) {
  let match;
  if (_.isString(key) && (match = key.match(/^\$|\.|\0/))) {
    throw MinimongoError(`Key ${key} must not ${invalidCharMsg[match[0]]}`);
  }
};

// checks if all field names in an object are valid
export function assertHasValidFieldNames(doc){
  if (doc && typeof doc === "object") {
    JSON.stringify(doc, (key, value) => {
      assertIsValidFieldName(key);
      return value;
    });
  }
};