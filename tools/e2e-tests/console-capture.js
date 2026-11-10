// Keep collecting through the assertions that consume later browser events.
async function withConsoleCapture(page, callback) {
  const messages = [];
  const listener = message => {
    const text = message.text();
    messages.push(text);
    console.log(`Browser console: ${text}`);
  };
  page.on('console', listener);
  try {
    return await callback(messages);
  } finally {
    page.removeListener('console', listener);
  }
}

module.exports = { withConsoleCapture };
