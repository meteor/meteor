const PROTOCOL_VERSION = 1;

function formatResultFrame({ architecture, generation = 1, result }) {
  return `[Meteor-Rstest] ${JSON.stringify({
    type: 'result',
    protocolVersion: PROTOCOL_VERSION,
    generation,
    architecture,
    result,
  })}`;
}

function shouldEmitResultFrames(env = process.env) {
  return env?.METEOR_RSTEST_DEBUG === '1';
}

function createStyles(colors) {
  const style = (code, value) => (
    colors ? `\u001b[${code}m${value}\u001b[0m` : value
  );

  return {
    bold: value => style(1, value),
    cyan: value => style(36, value),
    green: value => style(32, value),
    red: value => style(31, value),
    yellow: value => style(33, value),
  };
}

function formatCountSummary(counts, styles, { includeTotal = true } = {}) {
  const values = [
    ['failed', styles.red],
    ['passed', styles.green],
    ['skipped', styles.yellow],
    ['todo', styles.cyan],
  ].flatMap(([status, color]) => (
    counts[status] > 0 ? [color(`${counts[status]} ${status}`)] : []
  ));
  const total = counts.failed + counts.passed + counts.skipped + counts.todo;
  const suffix = includeTotal && values.length > 1 ? ` (${total})` : '';
  return `${values.join(' | ')}${suffix}`;
}

function caseErrors(testCase) {
  if (Array.isArray(testCase.errors) && testCase.errors.length > 0) {
    return testCase.errors;
  }
  return testCase.error === undefined ? [] : [testCase.error];
}

function formatError(error) {
  const normalized = typeof error === 'object' && error !== null
    ? error
    : { message: String(error) };
  const name = normalized.name || 'Error';
  const message = normalized.message || 'Test failed';
  const heading = `${name}: ${message}`;
  const stackLines = typeof normalized.stack === 'string'
    ? normalized.stack.split('\n')
    : [];

  if (stackLines[0] === heading) {
    stackLines.shift();
  }

  return [heading, ...stackLines];
}

function statusPresentation(status, styles) {
  switch (status) {
    case 'fail':
      return { icon: styles.red('×') };
    case 'skip':
      return { icon: styles.yellow('-') };
    case 'todo':
      return { icon: styles.cyan('*') };
    default:
      return { icon: styles.green('✓') };
  }
}

function resultFromCases(cases) {
  const stats = {
    total: cases.length,
    passed: cases.filter(testCase => testCase.status === 'pass').length,
    failed: cases.filter(testCase => testCase.status === 'fail').length,
    skipped: cases.filter(testCase => testCase.status === 'skip').length,
    todo: cases.filter(testCase => testCase.status === 'todo').length,
  };
  return { ok: stats.failed === 0, stats, cases };
}

function fileReportEntries(entries) {
  return entries.flatMap(entry => {
    const files = new Map();
    const untaggedCases = [];

    for (const testCase of entry.result.cases) {
      if (!testCase.testPath) {
        untaggedCases.push(testCase);
        continue;
      }
      if (!files.has(testCase.testPath)) {
        files.set(testCase.testPath, []);
      }
      files.get(testCase.testPath).push(testCase);
    }

    if (files.size === 0) {
      return [entry];
    }

    const fileEntries = [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([testPath, cases]) => ({
        architecture: entry.architecture,
        label: testPath,
        result: resultFromCases(cases),
      }));

    if (untaggedCases.length > 0) {
      fileEntries.push({
        architecture: entry.architecture,
        label: entry.label,
        result: resultFromCases(untaggedCases),
      });
    }
    return fileEntries;
  });
}

function resultStatus(result) {
  if (result.stats.failed > 0) return 'fail';
  if (result.stats.passed > 0) return 'pass';
  if (result.stats.skipped > 0) return 'skip';
  return 'todo';
}

function formatRuntimeReport({ entries, verbose = false, colors = true }) {
  if (!entries || entries.length === 0) {
    return '';
  }

  const styles = createStyles(colors);
  const lines = [];
  const reportEntries = fileReportEntries(entries);

  for (const entry of reportEntries) {
    const icon = statusPresentation(resultStatus(entry.result), styles).icon;
    const label = entry.label || `Meteor runtime · ${entry.architecture}`;
    lines.push(` ${icon} ${label} (${entry.result.stats.total})`);

    if (verbose) {
      for (const testCase of entry.result.cases) {
        const presentation = statusPresentation(testCase.status, styles);
        const duration = testCase.duration === undefined
          ? ''
          : ` (${testCase.duration}ms)`;
        const worker = testCase.worker
          ? ` ${styles.cyan(`[${testCase.worker}]`)}`
          : '';
        lines.push(`   ${presentation.icon} ${testCase.fullName || testCase.name}${duration}${worker}`);
      }
    }
  }

  const failedCases = reportEntries.flatMap(entry => (
    entry.result.cases.filter(testCase => testCase.status === 'fail')
  ));

  for (const testCase of failedCases) {
    lines.push('', ` ${styles.red('FAIL')}  ${testCase.fullName || testCase.name}`);
    const errors = caseErrors(testCase);
    const details = errors.length > 0 ? errors : [{ message: 'Test failed' }];
    for (const error of details) {
      for (const errorLine of formatError(error)) {
        lines.push(` ${errorLine}`);
      }
    }
  }

  const files = reportEntries.reduce((counts, entry) => {
    const status = resultStatus(entry.result);
    const countField = {
      fail: 'failed',
      pass: 'passed',
      skip: 'skipped',
      todo: 'todo',
    }[status];
    counts[countField] += 1;
    return counts;
  }, { failed: 0, passed: 0, skipped: 0, todo: 0 });
  const tests = reportEntries.reduce((counts, entry) => {
    counts.failed += entry.result.stats.failed;
    counts.passed += entry.result.stats.passed;
    counts.skipped += entry.result.stats.skipped;
    counts.todo += entry.result.stats.todo;
    return counts;
  }, { failed: 0, passed: 0, skipped: 0, todo: 0 });

  lines.push(
    '',
    ` ${styles.bold('Test Files')}  ${formatCountSummary(files, styles)}`,
    `      ${styles.bold('Tests')}  ${formatCountSummary(tests, styles)}`,
  );

  return lines.join('\n');
}

module.exports = {
  formatResultFrame,
  formatRuntimeReport,
  PROTOCOL_VERSION,
  shouldEmitResultFrames,
};
