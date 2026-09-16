/**
 * @jest-environment node
 */
import http from 'http';

import { waitForRspackBundle } from './assertions';

describe('Rspack bundle probe', () => {
  let server;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(503);
      res.end();
    });
    await new Promise(resolve => server.listen(0, resolve));
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  it('fails with probe diagnostics after all attempts are exhausted', async () => {
    const { port } = server.address();

    await expect(waitForRspackBundle(port, {
      attempts: 2,
      intervalMs: 0,
    })).rejects.toThrow(
      'Rspack bundle probe exhausted after 2 attempts: status=503, status=503',
    );
  });
});
