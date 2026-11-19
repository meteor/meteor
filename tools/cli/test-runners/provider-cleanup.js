async function cleanupTestRunner({ session, clearContext, error }) {
  try {
    if (session) await session.stop();
  } catch (cleanupError) {
    if (!error) throw cleanupError;
    // Preserve the failure that triggered cleanup, as provider lifecycle hooks
    // do, while still making a cleanup failure available to the caller.
    if (typeof error === 'object' || typeof error === 'function') {
      try {
        error.cleanupError = cleanupError;
      } catch {}
    }
  } finally {
    await clearContext();
  }
}

module.exports = { cleanupTestRunner };
