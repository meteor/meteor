// jest.setup.js
import chalk from 'chalk';

// Clear NODE_ENV so meteor commands don't inherit any value from the test runner environment
process.env.NODE_ENV = '';

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
