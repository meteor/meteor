# Collections and Models

1. Mongo Collections in Meteor
  1. Server side Mongo "real" collections backed by a DB
  2. Client side Minimongo "remote-backed" collections backed by a DDP connection
  3. Local Minimongo Collections backed by nothing.
2. Definining a Collection with a Schema
  1. Why schemas are important in a schema-less db
    1. Controlling the database
    2. Avoiding "writing schemas in code" -- which is what you end up doing if you don't have a schema
  2. The Simple Schema package and how to define a schema
  3. Using schemas -- running a validation, getting errors back
  4. The `ValidationError` and how it relates to the form chapter.
3. Mutating data -- writing insert/update/remove functions
  1. Using an instance of a `Collection2` to force Schema checks.
  2. Using `autovalue` and `defaultValue` to "define" more complex insert/update code.
  3. Subclassing `Collection2` to do arbitrary things on mutations.
  4. "Hooking" data by subclassing Collection2.
    1. Description of the need for hooks
    2. How the careful use of utilities can allow readable mutators that have hooks
  5. EG: Denormalization patterns
    1. Define your denormalizer in a different file
    2. Hook the denormalizer in various `insert/update/remove` functions
4. Custom mutators
  1. In a public API it's best to be *less* general rather than *more* general (see security article)
  2. Your methods are your public API.
  3. So write a `bar.addFoo` mutator rather than allowing `bar.update` to add `foo`.
  4. Using the `Method` pattern to wrap a mutator in a public API of the same name.
    1. Reference to Dave Weldon's post on the subject / see also Form chapter.
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
  2. Returning a cursors from a helper to get related documents
  3. Using a `cursor-utils` package to narrow down cursors etc [HELP NEEDED?]
7. Advanced schema usage
  1. https://github.com/aldeed/meteor-simple-schema
  4. Using JSONSchema with SS
8. Other packages / approaches
  1. Astronomy
    1. Brings the "ORM-y" `.save()` to your models.
  2. Collection hooks
    1. Allows you to follow a hook/aspect oriented patterns you don't need to fully describe your mutators in one go.