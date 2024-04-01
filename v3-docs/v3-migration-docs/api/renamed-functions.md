# Renamed functions

In v3, we decided to rename a few functions to make their API more consistent.

  - `Accounts.setPassword`
  - `Assets.getText`
  - `Assets.getBinary`


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


