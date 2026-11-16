export const getMessage = (input?: { payload?: { message?: string } }): string =>
  input?.payload?.message ?? 'missing';
