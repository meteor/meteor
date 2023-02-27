module.exports = {
  parser: 'babel-eslint',
  parserOptions: {
    allowImportExportEverywhere: true,
  },
  env: {
    node: true,
    browser: true,
  },
  plugins: ['meteor'],
  extends: ['airbnb', 'plugin:meteor/recommended'],
  settings: {
    'import/resolver': 'meteor',
  },
  rules: {
    'react/jsx-filename-extension': 0,
    'import/no-absolute-path': 0,
    'import/extensions': 0,

    // disabled so that we're not expecting to find 'meteor' within
    // our dependencies.
    // XXX: this *should* be taken care of by eslint-import-resolver-meteor, investigate.
    'import/no-extraneous-dependencies': 0,

    'no-underscore-dangle': [
      'error',
      {
        allow: ['_id', '_ensureIndex'],
      },
    ],
    'object-shorthand': [
      'error',
      'always',
      {
        avoidQuotes: false,
      },
    ],

    'space-before-function-paren': 0,

    // for Meteor API's that rely on `this` context, e.g. Template.onCreated and publications
    'func-names': 0,
    'prefer-arrow-callback': 0,
  },
};
