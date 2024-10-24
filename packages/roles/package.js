/* eslint-env meteor */

Package.describe({
  summary: 'Authorization package for Meteor',
  version: '1.0.0',
  name: 'roles'
})

Package.onUse(function (api) {

  const both = ['client', 'server']

  api.use([
    'ecmascript',
    'accounts-base',
    'tracker',
    'mongo',
    'check',
    'ddp'
  ], both)

  api.use('zodern:types@1.0.13')

  api.use(['blaze@2.9.0 || 3.0.0'], 'client', { weak: true })

  api.export(['Roles', 'RolesCollection', 'RoleAssignmentCollection'])

  api.addFiles('roles_client.js', 'client')
  api.addFiles('roles_common_async.js', both)
  api.addFiles('roles_server.js', 'server')
  api.addFiles([
    'client/debug.js',
    'client/uiHelpers.js'
  ], 'client')
})

Package.onTest(function (api) {
  // Add code coverage
  api.use([
    'lmieulet:meteor-legacy-coverage',
    'lmieulet:meteor-coverage@4.1.0 || 5.0.0',
    'meteortesting:mocha@2.1.0 || 3.2.0'
  ])

  api.versionsFrom(['2.8.1', '3.0'])

  const both = ['client', 'server']

  // `accounts-password` is included so `Meteor.users` exists

  api.use([
    'ecmascript',
    'alanning:roles',
    'mongo'
  ], both)

  api.addFiles('tests/serverAsync.js', 'server')
  api.addFiles('tests/client.js', 'client')
  api.addFiles('tests/clientAsync.js', 'client')
})
