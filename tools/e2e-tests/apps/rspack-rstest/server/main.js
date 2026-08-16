import { packageCoverageValue } from 'meteor/rstest-e2e-fixture';
import { serverCoverageValue } from '../imports/coverage/server-target.js';

console.log('rspack-rstest app server loaded');
console.log(serverCoverageValue(), packageCoverageValue('server'));
