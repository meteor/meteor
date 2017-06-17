// Creating a document from an upsert is quite tricky.
// E.g. this selector: {"$or": [{"b.foo": {"$all": ["bar"]}}]}, should result in: {"b.foo": "bar"}
// But this selector: {"$or": [{"b": {"foo": {"$all": ["bar"]}}}]} should throw an error

// Some rules (found mainly with trial & error, so there might be more):
// - handle all childs of $and (or implicit $and)
// - handle $or nodes with exactly 1 child
// - ignore $or nodes with more than 1 child
// - ignore $nor and $not nodes
// - throw when a value can not be set unambiguously
// - every value for $all should be dealt with as separate $eq-s
// - threat all children of $all as $eq setters (=> set if $all.length === 1, otherwise throw error)
// - you can not mix '$'-prefixed keys and non-'$'-prefixed keys
// - you can only have dotted keys on a root-level
// - you can not have '$'-prefixed keys more than one-level deep in an object

// Fills a document with certain fields from an upsert selector
populateDocumentWithQueryFields = function (query, document = {}) {

    if (Object.getPrototypeOf(query) === Object.prototype) {
        // handle implicit $and
        for (let [key, value] of Object.entries(query)) {
            // handle explicit $and
            if (key === "$and") {
                value.forEach(sq => populateDocumentWithQueryFields(sq, document))
            }
            // handle $or nodes with exactly 1 child
            else if (key === "$or") {
                if (value.length === 1) {
                    populateDocumentWithQueryFields(value[0], document)
                }
            }
            //Ignore other '$'-prefixed logical selectors
            else if (key[0] !== "$") {
                populateDocumentWithKeyValue(document, key, value);
            }
        }
    } else {
        // Handle meteor-specific shortcut for selecting _id
        if (LocalCollection._selectorIsId(query)) {
            insertIntoDocument(document, "_id", query);
        }
    }

    return document;

}

// Handles one key/value pair to put in the selector document
function populateDocumentWithKeyValue(document, key, value) {
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
        populateDocumentWithObject(document, key, value);
    } else {
        insertIntoDocument(document, key, value);
    }
}


// Handles a key, value to put in the selector document if the value is an object
function populateDocumentWithObject(document, key, value) {
    const keys = Object.keys(value);
    const unprefixedKeys = keys.filter(k => k[0] !== "$");

    if (unprefixedKeys.length > 0 || !keys.length) {
        //Literal (possibly empty) object ( or empty object ) 
        //Don't allow mixing '$'-prefixed with non-'$'-prefixed fields
        if (keys.length !== unprefixedKeys.length) {
            throw new Error(`unknown operator: ${unprefixedKeys[0]}`)
        } else {
            validateObject(value, key);
            insertIntoDocument(document, key, value);
        }
    } else {
        for (let [k, v] of Object.entries(value)) {
            if (k === "$eq") {
                populateDocumentWithKeyValue(document, key, v);
            }
            //every value for $all should be dealt with as separate $eq-s
            else if (k === "$all") {
                v.forEach(vx => populateDocumentWithKeyValue(document, key, vx))
            }
        }
    }
}

// Actually inserts a key value into the selector document
// However, this checks there is no ambiguity in setting the value for the given key, throws otherwise
function insertIntoDocument(document, key, value) {

    Object.keys(document).forEach(existingKey => {
        if (
            (existingKey.length > key.length && existingKey.indexOf(key) === 0)
            || (key.length > existingKey.length && key.indexOf(existingKey) === 0)
        ) {
            throw new Error(`cannot infer query fields to set, both paths '${existingKey}' and '${key}' are matched`)
        }
        else if (existingKey === key) {
            throw new Error(`cannot infer query fields to set, path ${key} is matched twice`)
        }
    })

    document[key] = value;
}

// Recursively validates an object that is nested more than one level deep
function validateObject(obj, path) {
    if (obj && Object.getPrototypeOf(obj) === Object.prototype) {
        for (let [key, value] of Object.entries(obj)) {
            validateKeyInPath(key, path);
            validateObject(value, path + "." + key);
        }
    }
}

// Validates the key in a path. Objects that are nested more then 1 level cannot have dotted fields or fields starting with '$'
function validateKeyInPath(key, path) {
    if (key.includes(".")) {
        throw new Error(`The dotted field '${key}' in '${path}.${key}' is not valid for storage.`)
    }
    if (key[0] === "$") {
        throw new Error(`The dollar ($) prefixed field  '${path}.${key}' is not valid for storage.`)
    }
}