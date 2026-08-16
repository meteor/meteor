async function completeNativeOnlyTestRunner({
  session,
  exitCode,
  clearContext,
}) {
  try {
    const completionResult = await session.completeRun({
      exitCode,
      outcome: exitCode === 0 ? 'completed' : 'failed',
    });
    return exitCode === 0 && completionResult?.exitCode !== undefined
      ? completionResult.exitCode
      : exitCode;
  } finally {
    await session.stop();
    await clearContext();
  }
}

module.exports = {
  completeNativeOnlyTestRunner,
};
