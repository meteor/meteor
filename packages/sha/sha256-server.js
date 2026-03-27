import { createHash } from 'crypto';

export const SHA256 = (input) =>
  createHash('sha256').update(input, 'utf8').digest('hex');
