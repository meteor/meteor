import { WebApp } from 'meteor/webapp';
import runPortableCommand from '@example/workspace';

WebApp.handlers.use((req, res, next) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ready');
  } else if (req.url === '/portability') {
    try {
      const value = runPortableCommand();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(value);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(error.stack);
    }
  } else {
    next();
  }
});
