{
  const ctx = import.meta.webpackContext('/', {
    recursive: true,
    regExp: /\.(?:test|spec)s?\.[^.]+$/,
    exclude: /(^|\/)(node_modules|\.meteor|_build)(\/|$)/,
    mode: 'eager',
  });
  ctx.keys().forEach(ctx);
}
