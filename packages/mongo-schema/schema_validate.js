// packages/mongo-schema/schema_validate.js
import { ErrorTypes, ValidationError } from './schema_errors.js';

export function validate(ir, doc, options = {}) {
  const errors = collectErrors(ir, doc, options);
  if (errors.length > 0) {
    throw new ValidationError(errors);
  }
}

export function collectErrors(ir, doc, options = {}) {
  if (options.modifier) {
    return collectModifierErrors(ir, doc, options);
  }

  const errors = [];
  const keysToValidate = options.keys ? new Set(options.keys) : null;
  const ignoreTypes = options.ignore ? new Set(options.ignore) : null;

  // Validate top-level fields
  for (const [key, desc] of ir) {
    if (key.includes('.')) continue; // Skip nested; handled via recursion
    if (keysToValidate && !keysToValidate.has(key)) continue;

    validateField(ir, key, desc, doc, doc[key], errors, options);
  }

  // Run instance validators
  if (options._schema) {
    const validators = options._validators || [];
    const docValidators = options._docValidators || [];
    const globalValidators = options._globalValidators || [];
    const globalDocValidators = options._globalDocValidators || [];

    for (const validator of [...validators, ...globalValidators]) {
      for (const [key, desc] of ir) {
        if (key.includes('.')) continue;
        const context = {
          key,
          genericKey: key,
          value: doc[key],
          isSet: doc[key] !== undefined,
          operator: null,
          definition: desc,
          field(name) { return { isSet: doc[name] !== undefined, value: doc[name], operator: null }; },
          siblingField(name) { return this.field(name); },
          parentField() { return { isSet: true, value: doc, operator: null }; },
        };
        const result = validator.call(context);
        if (typeof result === 'string') {
          errors.push({ name: key, type: result, value: doc[key], message: `${desc.label || key} failed validation: ${result}` });
        }
      }
    }
    for (const docValidator of [...docValidators, ...globalDocValidators]) {
      const docErrors = docValidator(doc);
      if (Array.isArray(docErrors)) errors.push(...docErrors);
    }
  }

  // Filter ignored error types
  if (ignoreTypes) {
    return errors.filter(e => !ignoreTypes.has(e.type));
  }
  return errors;
}

function validateField(ir, key, desc, rootDoc, value, errors, options) {
  const isPresent = value !== undefined && value !== null;

  // Required check
  if (desc.required && !isPresent) {
    errors.push({
      name: key,
      type: ErrorTypes.REQUIRED,
      value: undefined,
      message: `${desc.label || key} is required`,
    });
    return;
  }

  // If not present and not required, skip
  if (!isPresent) return;

  // Type check
  if (!desc.resolvedType.check(value)) {
    if (desc.resolvedType.name === 'integer' && typeof value === 'number' && !Number.isInteger(value)) {
      errors.push({
        name: key,
        type: ErrorTypes.MUST_BE_INTEGER,
        value,
        message: `${desc.label || key} must be an integer`,
      });
    } else if (desc.resolvedType.name === 'date' && value instanceof Date) {
      errors.push({
        name: key,
        type: ErrorTypes.BAD_DATE,
        value,
        message: `${desc.label || key} is not a valid date`,
      });
    } else {
      errors.push({
        name: key,
        type: ErrorTypes.EXPECTED_TYPE,
        value,
        message: `${desc.label || key} expected type ${desc.resolvedType.name}`,
      });
    }
    return;
  }

  // Constraint checks
  validateConstraints(key, desc, value, errors, options);

  // Custom validator
  if (desc.custom) {
    runCustomValidator(ir, key, desc, rootDoc, value, errors, options);
  }

  // Recurse into nested objects
  if (desc.resolvedType.name === 'object' && desc.children && !desc.blackbox) {
    for (const childKey of desc.children) {
      const childDesc = ir.get(childKey);
      const childLocalKey = childKey.slice(key.length + 1);
      validateField(ir, childKey, childDesc, rootDoc, value[childLocalKey], errors, options);
    }
  }

  // Recurse into arrays
  if (desc.resolvedType.name === 'array' && desc.itemKey) {
    const itemDesc = ir.get(desc.itemKey);
    for (let i = 0; i < value.length; i++) {
      const itemKey = `${key}.${i}`;
      validateField(ir, itemKey, itemDesc, rootDoc, value[i], errors, options);
    }
  }
}

function validateConstraints(key, desc, value, errors, options) {
  const label = desc.label || key;

  // denyInsert / denyUpdate
  if (desc.denyInsert && options.isInsert && value !== undefined) {
    errors.push({ name: key, type: ErrorTypes.DENY_INSERT, value, message: `${label} cannot be set during insert` });
  }
  if (desc.denyUpdate && options.isUpdate) {
    errors.push({ name: key, type: ErrorTypes.DENY_UPDATE, value, message: `${label} cannot be set during update` });
  }

  // allowedValues
  if (desc.allowedValues) {
    const allowed = Array.isArray(desc.allowedValues) ? desc.allowedValues : [...desc.allowedValues];
    if (!allowed.includes(value)) {
      errors.push({ name: key, type: ErrorTypes.VALUE_NOT_ALLOWED, value, message: `${label} is not an allowed value` });
    }
  }

  // min/max for numbers
  if (typeof value === 'number') {
    if (desc.min !== undefined) {
      if (desc.exclusiveMin ? value <= desc.min : value < desc.min) {
        errors.push({ name: key, type: desc.exclusiveMin ? ErrorTypes.MIN_NUMBER_EXCLUSIVE : ErrorTypes.MIN_NUMBER, value, message: `${label} must be at least ${desc.min}` });
      }
    }
    if (desc.max !== undefined) {
      if (desc.exclusiveMax ? value >= desc.max : value > desc.max) {
        errors.push({ name: key, type: desc.exclusiveMax ? ErrorTypes.MAX_NUMBER_EXCLUSIVE : ErrorTypes.MAX_NUMBER, value, message: `${label} must be at most ${desc.max}` });
      }
    }
  }

  // min/max for strings (length)
  if (typeof value === 'string') {
    if (desc.min !== undefined && value.length < desc.min) {
      errors.push({ name: key, type: ErrorTypes.MIN_STRING, value, message: `${label} must be at least ${desc.min} characters` });
    }
    if (desc.max !== undefined && value.length > desc.max) {
      errors.push({ name: key, type: ErrorTypes.MAX_STRING, value, message: `${label} must be at most ${desc.max} characters` });
    }
  }

  // min/max for dates
  if (value instanceof Date) {
    if (desc.min !== undefined && value < desc.min) {
      errors.push({ name: key, type: ErrorTypes.MIN_DATE, value, message: `${label} must be on or after ${desc.min}` });
    }
    if (desc.max !== undefined && value > desc.max) {
      errors.push({ name: key, type: ErrorTypes.MAX_DATE, value, message: `${label} must be on or before ${desc.max}` });
    }
  }

  // regEx
  if (desc.regEx && typeof value === 'string') {
    const patterns = Array.isArray(desc.regEx) ? desc.regEx : [desc.regEx];
    const matches = patterns.some(re => re.test(value));
    if (!matches) {
      errors.push({ name: key, type: ErrorTypes.FAILED_REGULAR_EXPRESSION, value, message: `${label} failed regular expression validation` });
    }
  }

  // minCount/maxCount for arrays
  if (Array.isArray(value)) {
    if (desc.minCount !== undefined && value.length < desc.minCount) {
      errors.push({ name: key, type: ErrorTypes.MIN_COUNT, value, message: `${label} must have at least ${desc.minCount} items` });
    }
    if (desc.maxCount !== undefined && value.length > desc.maxCount) {
      errors.push({ name: key, type: ErrorTypes.MAX_COUNT, value, message: `${label} must have at most ${desc.maxCount} items` });
    }
  }
}

function runCustomValidator(ir, key, desc, rootDoc, value, errors, options) {
  const context = {
    key,
    genericKey: key.replace(/\.\d+\./g, '.$.').replace(/\.\d+$/, '.$'),
    value,
    isSet: value !== undefined,
    operator: null,
    definition: desc,
    field(name) {
      return { isSet: rootDoc[name] !== undefined, value: rootDoc[name], operator: null };
    },
    siblingField(name) { return this.field(name); },
    parentField() { return { isSet: true, value: rootDoc, operator: null }; },
    ...(options.extendedCustomContext || {}),
  };

  const result = desc.custom.call(context);
  if (typeof result === 'string') {
    errors.push({ name: key, type: result, value, message: `${desc.label || key} failed validation: ${result}` });
  }
}

function collectModifierErrors(ir, modifier, options) {
  const errors = [];
  const keysToValidate = options.keys ? new Set(options.keys) : null;
  const ignoreTypes = options.ignore ? new Set(options.ignore) : null;

  // Validate fields within each operator
  const typeCheckOps = ['$set', '$setOnInsert'];
  for (const op of typeCheckOps) {
    if (!modifier[op]) continue;
    for (const [key, value] of Object.entries(modifier[op])) {
      if (keysToValidate && !keysToValidate.has(key)) continue;
      const desc = ir.get(key);
      if (!desc) continue;
      validateField(ir, key, desc, modifier[op], value, errors, options);
    }
  }

  // $inc fields must be numeric
  if (modifier.$inc) {
    for (const [key, value] of Object.entries(modifier.$inc)) {
      if (typeof value !== 'number') {
        const desc = ir.get(key);
        errors.push({
          name: key,
          type: ErrorTypes.EXPECTED_TYPE,
          value,
          message: `${(desc && desc.label) || key} $inc value must be a number`,
        });
      }
    }
  }

  // $push/$addToSet — validate the pushed item against the array item schema
  for (const op of ['$push', '$addToSet']) {
    if (!modifier[op]) continue;
    for (const [key, value] of Object.entries(modifier[op])) {
      const itemKey = `${key}.$`;
      const itemDesc = ir.get(itemKey);
      if (!itemDesc) continue;
      const pushValue = value && value.$each ? null : value;
      if (pushValue !== null && pushValue !== undefined) {
        validateField(ir, itemKey, itemDesc, modifier[op], pushValue, errors, options);
      }
    }
  }

  if (ignoreTypes) {
    return errors.filter(e => !ignoreTypes.has(e.type));
  }
  return errors;
}
