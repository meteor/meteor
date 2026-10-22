const chalk = require('chalk');

/**
 * Custom Jest reporter that prints a structured summary of all test results,
 * including detailed error logs for failures.
 */
class SummaryReporter {
  constructor(globalConfig) {
    this._globalConfig = globalConfig;
  }

  onRunComplete(_contexts, results) {
    const passed = [];
    const failed = [];
    const skipped = [];

    for (const suite of results.testResults) {
      for (const test of suite.testResults) {
        const entry = {
          name: test.fullName || test.title,
          suite: suite.testFilePath.replace(this._globalConfig.rootDir + '/', ''),
          duration: test.duration,
          status: test.status,
        };

        if (test.status === 'passed') {
          passed.push(entry);
        } else if (test.status === 'failed') {
          entry.errors = test.failureMessages || [];
          failed.push(entry);
        } else {
          skipped.push(entry);
        }
      }
    }

    this._printConsole(passed, failed, skipped);
  }

  _printConsole(passed, failed, skipped) {
    const hasFails = failed.length > 0;
    const divider = chalk.dim('═'.repeat(70));
    const thinDivider = chalk.dim('─'.repeat(70));

    console.log('\n' + divider);
    console.log(hasFails
      ? chalk.bold.red('  E2E TEST SUMMARY')
      : chalk.bold.green('  E2E TEST SUMMARY'));
    console.log(divider);

    if (passed.length > 0) {
      console.log(chalk.green(`\n  PASSED (${passed.length}):`));
      console.log(thinDivider);
      for (const t of passed) {
        const duration = t.duration ? chalk.dim(` (${(t.duration / 1000).toFixed(1)}s)`) : '';
        console.log(`    ${chalk.green('✓')} ${t.name}${duration}`);
      }
    }

    if (skipped.length > 0 && process.env.E2E_SHOW_SKIPPED) {
      console.log(chalk.yellow(`\n  SKIPPED (${skipped.length}):`));
      console.log(thinDivider);
      for (const t of skipped) {
        console.log(`    ${chalk.yellow('○')} ${chalk.dim(t.name)}`);
      }
    }

    if (failed.length > 0) {
      console.log(chalk.red(`\n  FAILED (${failed.length}):`));
      console.log(thinDivider);
      for (const t of failed) {
        const duration = t.duration ? chalk.dim(` (${(t.duration / 1000).toFixed(1)}s)`) : '';
        console.log(`\n    ${chalk.red('✕')} ${chalk.bold(t.name)}${duration}`);
        console.log(`      ${chalk.dim('Suite:')} ${chalk.dim(t.suite)}`);
        for (const err of t.errors) {
          const indented = err
            .split('\n')
            .map(line => `      ${chalk.red(line)}`)
            .join('\n');
          console.log(indented);
        }
      }
    }

    const totalTime = [...passed, ...failed, ...skipped]
      .reduce((sum, t) => sum + (t.duration || 0), 0);

    console.log('\n' + divider);
    console.log(
      `  ${chalk.bold('TOTAL:')} ${passed.length + failed.length + skipped.length} ${chalk.dim('|')} ` +
      `${chalk.green('PASSED:')} ${chalk.green(passed.length)} ${chalk.dim('|')} ` +
      `${chalk.red('FAILED:')} ${chalk.red(failed.length)} ${chalk.dim('|')} ` +
      `${chalk.yellow('SKIPPED:')} ${chalk.yellow(skipped.length)} ${chalk.dim('|')} ` +
      `${chalk.dim('TIME:')} ${chalk.dim((totalTime / 1000).toFixed(1) + 's')}`
    );
    console.log(divider + '\n');
  }
}

module.exports = SummaryReporter;
