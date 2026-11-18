# Legal management

- `Who maintains the package` – [Storyteller](https://github.com/sponsors/StorytellerCZ)

[[toc]]

## What is this package?

This package adds the basic functionality to manage your legal documents and makes them easily accessible for users together with managing user's consent. This package provides server side publications and methods.

## How to download it?
```bash
meteor add freedombase:legal-management
```

### Sources

* [GitHub repository](https://github.com/Freedombase/meteor-legal-management)

## How to use it?

This package has two parts. First is the management of legal documents. Second is the management of user (or other entities) consent to these documents.

### Integration into your app

#### Migration

If you have an existing app you will want to do a database migration for your existing users. This should look something like this:

```js
import { Meteor } from 'meteor/meteor';
import { LegalAgreementCollection } from 'meteor/freedombase:legal-management';

const users = await Meteor.users.find({}, { fields: { _id: 1 } }).fetchAsync();

for (const user of users) {
  LegalAgreementCollection.insertAsync({ ownerId: user._id, agreements: [], history: [] });
}
```
If the users have already agreed to legal documents fill `agreements` array with the appropriate values.

#### Collection hooks

```js
import { Meteor } from 'meteor/meteor';
import { LegalAgreementCollection } from 'meteor/freedombase:legal-management';

Meteor.users.after.insert((userId, document) => {
  LegalAgreementCollection.insert({ ownerId: document._id, agreements: [], history: [] }, (err, id) => {
      if (id) {
        // the user had to agree to be able to access the registration page
        // TODO adjust to your needs
        Meteor.call('freedombase:legal.agreements.agreeBy', 'tos', document._id);
        // or
        // Meteor.call('freedombase:legal.agreements.agreeBy', ['tos', 'privacy', 'copyright'], document._id);
      }
    });
});
```

## API - Agreements

### Methods

#### `freedombase:legal.addNewVersion`
Create a new version of the defined document.
* @param `documentAbbr` {String} Document abbreviation.
* @param `version` {String} Version of the document.
* @param `language` {String} Language code.
* @param `title` {String} Title of the document.
* @param `text` {Object} Text of the document for display.
* @param `changelog` {Object} Changelog from the previous version.
* @param `from` {Date} OPTIONAL From what date is the document effective. If no option provided, it will be effective immediately.
* @return {string} ID of the inserted document.

#### `freedombase:legal.addNewVersionAll`
Add new version with i18n object.
* @param `documentAbbr` {String} Document abbreviation.
* @param `version` {String} Version of the document.
* @param `language` {String} Language code of the main document.
* @param `title` {String} Title of the document.
* @param `text` {Object} Text of the document for display.
* @param `changelog` {Object} Changelog from the previous version.
* @param `i18n` {Object} Object with the translations. e.g. { cs: { title: "...", text: "..." }, es: { title: "...", text: "..." }, ...}
* @param `from` {Date} OPTIONAL From what date is the document effective. If no option provided, it will be effective immediately.
* @return {string} ID of the inserted document.

#### `freedombase:legal.addTranslation`
Adds translation to already existing document.
* @param `documentAbbr` {String} Document abbreviation.
* @param `version` {String} Version of the document.
* @param `title` {String} Title of the document.
* @param `text` {Object} Text of the document for display.
* @param `language` {String} Language code of the translation.
* @param `changelog` {Object} Changelog from the previous version.
* @return {number} Number of affected documents. Should be 1, or else the update failed.

#### `freedombase:legal.updateChangelog`
Update changelog for the given language.
* @param `id` {String} ID (`_id`) of the document.
* @param `language` {String} Language code of the translation.
* @param `changelog` {Object} New version of the changelog.
* @return {number}

### Authorization hook
The above methods all share a hook to check if a user is allowed to add a legal document.

#### `canAddLegalHook`
Import: `import { canAddLegalHook } from 'meteor/freedombase:legal-management`
You can create a new hook by registering it: `canAddLegalHook.register((documentAbbr, language, userId) => {/* Your authorization logic, return true to allow or false to stop. */})`

### Publications

#### `freedombase:legal.getLatest`
Gets the latest version of the given document in the given language.
* @param `documentAbbr` {String}
* @param `language` {String}
* @return {Mongo.Cursor}

#### `freedombase:legal.getAll`
Get full version of all documents in the given language.
* @param `documentAbbr` {String}
* @param `language` {String}
* @return {Mongo.Cursor}

#### `freedombase:legal.get`
Get full version of the given documents of the given version in the given language.
* @param `documentAbbr` {String}
* @param `version` {String}
* @param `language` {String}
* @return {Mongo.Cursor}

#### `freedombase:legal.getVersions`
Gets version list for the given document abbreviation.
* @param `documentAbbr` {String}
* @return {Mongo.Cursor}

#### `freedombase:legal.getDocument`
Gets a document by its id.
* @param `documentId` {String}
* @return {Mongo.Cursor}

## API - Consent

### Methods

#### `freedombase:legal.agreements.agreeBy`
Give agreement to the given document by the currently logged in user.
* @param `what` {String|Array} Ids or abbreviations of the legal document
* @param `userId` {String} Optionally send userId in cases when user is logging in or creating account. Logged in user will take precedent before this param.
* @returns {Array} Array of results of update functions

#### `freedombase:legal.agreements.revokeBy`
Revoke agreement to the given document by the currently logged in user.
* @param `what` {String|Array} Ids or abbreviations of the legal document
* @returns {Array} Array of results of update functions

### Hooks
Both of the above methods have hook on before and after action. They are:

#### `beforeAgreedHook`
Import: `import { beforeAgreedHook } from 'meteor/freedombase:legal-management`
Part of the `freedombase:legal.agreements.agreeBy` method and triggers before any DB action takes place. If false is returned, then the DB action will not execute, so you need to return `true` if you want the execution of the method to continue.
You can create a new hook by registering it: `beforeAgreedHook.register((whichAgreement, userId) => {})`
This hook will receive in the first argument which agreement is the subject of the call and in second the user id.

#### `afterAgreedHook`
Import: `import { afterAgreedHook } from 'meteor/freedombase:legal-management`
Part of the `freedombase:legal.agreements.agreeBy` method and triggers after DB actions take place.
You can create a new hook by registering it: `afterAgreedHook.register((whichAgreement, userId, dbResults) => {})`
This hook will receive in the first argument which agreement is the subject of the call and in second the user id, the final one will be the result of the DB action.

#### `beforeRevokedHook`
Import: `import { beforeRevokedHook } from 'meteor/freedombase:legal-management`
Part of the `freedombase:legal.agreements.revokeBy` method and triggers before any DB action takes place.
You can create a new hook by registering it: `beforeRevokedHook.register((whichAgreement, userId) => {})`
This hook will receive in the first argument which agreement is the subject of the call and in second the user id.

#### `afterRevokedHook`
Import: `import { afterRevokedHook } from 'meteor/freedombase:legal-management`
Part of the `freedombase:legal.agreements.revokeBy` method and triggers after DB actions take place.
You can create a new hook by registering it: `afterRevokedHook.register((whichAgreement, userId, dbResults) => {})`
This hook will receive in the first argument which agreement is the subject of the call and in second the user id, the final one will be the result of the DB action.

### Publications

#### `freedombase:legal.agreements.for`
Gets agreements/consent to legal documents.
* @param `ownerId` {String} OPTIONAL, will default to the current user.
* @returns {Mongo.Cursor}

#### `freedombase:legal.agreements.history`
Get history of consent changes.
* @param `ownerId` {String} OPTIONAL, will default to the current user.
* @returns {Mongo.Cursor}

#### `freedombase:legal.agreements.full`
Get all the data
* @param ownerId {String} OPTIONAL, will default to the current user.
* @returns {Mongo.Cursor}
