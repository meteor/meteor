/**
 * @module rstest/tooling/plugin
 * @description Rstest test-runner provider registration
 */

const {
  RstestTestRunnerProvider,
} = require('./provider/provider.js');

Plugin.registerTestRunner({
  id: 'rstest',
  apiVersion: 1,
  activationPackages: ['rstest'],
  incompatiblePackages: [{
    name: 'tinytest',
    driverPackage: 'test-in-browser',
  }, {
    name: 'meteortesting:mocha',
    driverPackage: 'meteortesting:mocha',
  }],
}, context => new RstestTestRunnerProvider(context));
