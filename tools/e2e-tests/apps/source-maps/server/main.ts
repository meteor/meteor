import { WebApp } from 'meteor/webapp';
import * as eager from './probe';

// Keep the server probe independent so client edits exercise HMR without a
// simultaneous server restart reloading the page during a debugger pause.
globalThis.sourceMapProbe = eager;

WebApp.handlers.use('/source-map-probe', (req, res) => {
  try {
    eager.fail();
  } catch (error) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ revision: eager.revision, value: eager.probe(5), stack: error.stack }));
  }
});
