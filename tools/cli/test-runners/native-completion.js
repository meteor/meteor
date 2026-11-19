const { cleanupTestRunner } = require('./provider-cleanup.js');

async function completeNativeOnlyTestRunner({
  session,
  exitCode,
  completion,
  clearContext,
}) {
  let executionError;
  try {
    if (completion !== undefined) exitCode = await completion;
    const completionResult = await session.completeRun({
      exitCode,
      outcome: exitCode === 0 ? 'completed' : 'failed',
    });
    return exitCode === 0 && completionResult?.exitCode !== undefined
      ? completionResult.exitCode
      : exitCode;
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    await cleanupTestRunner({ session, clearContext, error: executionError });
  }
}

module.exports = {
  completeNativeOnlyTestRunner,
};
