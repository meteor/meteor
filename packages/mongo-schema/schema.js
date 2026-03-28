// packages/mongo-schema/schema.js
import { IntegerMarker, AnyMarker, oneOf } from './types.js';
import { ErrorTypes } from './schema_errors.js';
import { parseDefinition } from './schema_definition.js';
import { clean as cleanDoc } from './schema_clean.js';
import { validate as validateDoc } from './schema_validate.js';
import { ValidationContext } from './schema_context.js';
import { compileToJsonSchema } from './schema_jsonschema.js';

export class MongoSchema {
  constructor(definition, options = {}) {
    this._isMongoSchema = true;
    this._definition = definition;
    this._options = {
      requiredByDefault: true,
      humanizeAutoLabels: true,
      clean: {
        filter: true,
        autoConvert: true,
        removeEmptyStrings: true,
        trimStrings: true,
        getAutoValues: true,
      },
      ...options,
    };
    if (options.clean) {
      this._options.clean = { ...this._options.clean, ...options.clean };
    }
    this._ir = parseDefinition(definition, this._options);

    // Validator registries
    this._validators = [];
    this._docValidators = [];
  }

  extend(otherSchema) {
    const mergedDef = { ...this._definition, ...otherSchema._definition };
    return new MongoSchema(mergedDef, this._options);
  }

  pick(...keys) {
    const pickedDef = {};
    const keySet = new Set(keys);
    for (const [k, v] of Object.entries(this._definition)) {
      const topKey = k.split('.')[0];
      if (keySet.has(topKey) || keySet.has(k)) {
        pickedDef[k] = v;
      }
    }
    return new MongoSchema(pickedDef, this._options);
  }

  omit(...keys) {
    const keySet = new Set(keys);
    const omittedDef = {};
    for (const [k, v] of Object.entries(this._definition)) {
      const topKey = k.split('.')[0];
      if (!keySet.has(topKey) && !keySet.has(k)) {
        omittedDef[k] = v;
      }
    }
    return new MongoSchema(omittedDef, this._options);
  }

  clean(doc, options = {}) {
    const cleanOpts = {
      mutate: false,
      ...this._options.clean,
      ...options,
    };
    return cleanDoc(this._ir, doc, cleanOpts);
  }

  getObjectSchema(key) {
    const prefix = key + '.';
    const subDef = {};
    for (const [k, v] of Object.entries(this._definition)) {
      if (k.startsWith(prefix)) {
        subDef[k.slice(prefix.length)] = v;
      }
    }
    return new MongoSchema(subDef, this._options);
  }

  validate(doc, options = {}) {
    validateDoc(this._ir, doc, { ...options, _schema: this });
  }

  newContext() {
    return new ValidationContext(this);
  }

  namedContext(name) {
    if (!this._namedContexts) this._namedContexts = {};
    if (!this._namedContexts[name]) {
      this._namedContexts[name] = new ValidationContext(this);
    }
    return this._namedContexts[name];
  }

  toJsonSchema() {
    return compileToJsonSchema(this._ir);
  }

  addValidator(fn) { this._validators.push(fn); }
  addDocValidator(fn) { this._docValidators.push(fn); }

  schema(key) {
    if (key) return this._definition[key];
    return this._definition;
  }

  get(key, prop) {
    const def = this._definition[key];
    return def ? def[prop] : undefined;
  }

  label(key) {
    const desc = this._ir.get(key);
    return desc ? desc.label : undefined;
  }

  defaultValue(key) {
    const desc = this._ir.get(key);
    return desc ? desc.defaultValue : undefined;
  }

  getAllowedValuesForKey(key) {
    const desc = this._ir.get(key);
    return desc ? desc.allowedValues : undefined;
  }

  labels(labelMap) {
    for (const [key, lbl] of Object.entries(labelMap)) {
      const desc = this._ir.get(key);
      if (desc) desc.label = lbl;
    }
  }
}

// Static markers
MongoSchema.Integer = IntegerMarker;
MongoSchema.Any = AnyMarker;
MongoSchema.oneOf = oneOf;
MongoSchema.ErrorTypes = ErrorTypes;

// Global validators
MongoSchema._globalValidators = [];
MongoSchema._globalDocValidators = [];
MongoSchema.addValidator = function (fn) { MongoSchema._globalValidators.push(fn); };
MongoSchema.addDocValidator = function (fn) { MongoSchema._globalDocValidators.push(fn); };
