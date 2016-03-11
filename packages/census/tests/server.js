let routes = [
  { route: '/stats', handle: handleStats }
];

// Sends the payload back
function handleStats(req, res) {
  let chunks = [];
  req.setEncoding('utf8');

  req.on('data', (chunk) => {
    chunks.push(chunk);
  });

  req.on('end', () => {
    let body = chunks.join('');
    chunks = [];

    if (body.charAt(0) === '{') {
      body = JSON.parse(body);
    }

    let responseData = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body
    };

    let responseString = '';

    if (req.method !== 'HEAD')
      responseString = JSON.stringify(responseData);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(responseString);
  });
}

// Add routes
WebApp.connectHandlers.stack.splice(0, 0, ...routes);