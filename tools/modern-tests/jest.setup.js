// jest.setup.js
import chalk from 'chalk';

// This runs before each test
beforeEach(() => {
  const name = expect.getState().currentTestName;
  // e.g. a bright cyan arrow and test name
  console.log(chalk.cyan(`▶ ${name}`));
});
