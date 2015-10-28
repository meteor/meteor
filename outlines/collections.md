# Collections and Models

1. Mongo Collections in Meteor
  1. Server side Mongo "real" collections
  2. Client side Minimongo "remote-backed" collections
  3. Local Minimongo Collections
2. Definining a Collection with a Schema
  1. Why schemas are important in a schema-less db
  2. The Simple Schema (Collection2?) package and how to define a schema
  3. Using schemas -- running a validation.
3. Mutating data -- writing insert/update/remove functions
  1. Using Collection2 to always check the schema
  2. Using autovalue etc
  3. "Hooking" data by subclassing Collection2. [How to organize such code]
  4. Denormalization patterns
4. Designing your data schema
  1. "Impure" mongo -- i.e. things that Meteor will force you to do that you might not have done otherwise
    - Avoid subdocuments and large changing properties
    - Use more collections, normalize more
  2. Thinking ahead to future database changes
    - Don't try to predict the future but be flexible
5. Changing data schema - how to use migrations
  1. percolate:migrations package
  2. How to run migrations against a production db
    [is our best advice run locally pointing at the production db, use Meteor shell?]
  3. Multiple stage deploys which can handle both new and old format
6. Relational data and other helpers
  1. Using `dburles:collection-helpers` to add "methods" to your documents
  2. Returning a cusors from a helper to get related documents
  3. Using a `cursor-utils` package to narrow down cursors etc [HELP NEEDED?]
7. Advanced schema usage
  1. Sub-schemas
  2. Object + array properties
  3. Custom validation