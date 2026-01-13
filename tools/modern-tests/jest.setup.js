// jest.setup.js
import chalk from 'chalk';

const isCI = process.env.GITHUB_ACTIONS === "true";
if (isCI) {
  jest.retryTimes(2);
  console.log('Set 2 retries on Jest level');
}

// Set fixed ports for all tests
process.env.RSPACK_DEVSERVER_PORT = '8080';
process.env.RSDOCTOR_CLIENT_PORT = '8888';
process.env.RSDOCTOR_SERVER_PORT = '8889';

// This runs before each test
beforeEach(() => {
  const name = expect.getState().currentTestName;
  // e.g. a bright cyan arrow and test name
  console.log(chalk.cyan(`▶ ${name}`));
});
