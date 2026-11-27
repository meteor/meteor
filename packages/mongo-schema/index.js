// packages/mongo-schema/index.js
export { MongoSchema } from './schema.js';
export { ValidationError } from './schema_errors.js';

import { setupCollectionIntegration } from './collection_integration.js';
setupCollectionIntegration();
