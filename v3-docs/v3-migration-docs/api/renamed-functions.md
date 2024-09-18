# Renamed functions

In v3, we decided to rename a few functions to make their API more consistent.

  - `Accounts.setPassword`
  - `Assets.getText`
  - `Assets.getBinary`

::: tip

You can automatically adopt the new functions by running the [following codemod](https://go.codemod.com/meteor-renamed-functions):

```bash
npx codemod@latest meteor/v3/renamed-functions
```

:::

## Accounts.setPassword

It is no longer available, you should use `Accounts.setPasswordAsync`.

```javascript

// Before

function someFunction(userId, newPassword) {
  Accounts.setPassword(userId, newPassword);
}

// After

async function someFunction(userId, newPassword) {
  await Accounts.setPasswordAsync(userId, newPassword);
}

```

## Assets.getText

It is no longer available, you should use `Assets.getTextAsync`.

```javascript

// Before

function someFunction() {
  const text = Assets.getText('some-file.txt');
  return text;
}

// After

async function someFunction() {
  const text = await Assets.getTextAsync('some-file.txt');
  return text;
}

```

## Assets.getBinary

It is no longer available, you should use `Assets.getBinaryAsync`.

```javascript

// Before

function someFunction() {
  const binary = Assets.getBinary('some-file.txt');
  return binary;
}

// After

async function someFunction() {
  const binary = await Assets.getBinaryAsync('some-file.txt');
  return binary;
}

```

## Accounts.addEmail

It is no longer available, you should use `Accounts.addEmailAsync`.

```javascript
import { Accounts } from "meteor/accounts-base";

// Before

Accounts.addEmail(
  "userId",
  "newEmail",
  false,  // this param is optional 
);
// After

await Accounts.addEmailAsync(
  "userId",
  "newEmail",
  false,  // this param is optional 
);

```


For a full list of changes check the [changelog](https://v3-docs.meteor.com/history.html#changelog) for Meteor v3
