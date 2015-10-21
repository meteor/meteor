# Core API for collections (collections)

Prevent misusage of [collection](http://docs.meteor.com/#/full/collections).
Collections have to be declared in `.eslintrc` as settings. See [options](#Options) for details.

## Rule Details

This rule aims to prevent misusing any collections.

The following patterns are considered warnings:

```js

new Mongo.Collection()     // deprecated

```


```js

// When "Users" is declared as a Meteor collection in `.eslintrc`
Users = true              // no reassignment of collections possible

```


This rule checks the argument count of all collection methods.

```js

Users.insert()            // Missing argument

```

The following patterns are not warnings:

```js

Users = new Mongo.Collection('users')

```

```js

Users = new Mongo.Collection(null)

```

### Options

Declare the available collections through `.eslintrc`.

Example of an `.eslintrc` file declaring the collections `Users` and `Posts`:

```js

{
  settings: {
    meteor: {
      collections: [
        'Users',
        'Posts'
      ]
    }
  }
}

```

## Limitations

- Does not verify usage of
  - [Mongo.ObjectID](http://docs.meteor.com/#/full/mongo_object_id)
  - [Mongo Cursors](http://docs.meteor.com/#/full/mongo_cursor)
  - Arguments to collection methods, e.g. `find()`


## Further Reading

- http://docs.meteor.com/#/full/collections


## Possible Improvements

* Verify arguments to collection methods
