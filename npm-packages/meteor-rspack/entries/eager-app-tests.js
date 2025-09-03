{
  const ctx = import.meta.webpackContext('/', {
    recursive: true,
    regExp: /\.app-(?:test|spec)s?\.[^.]+$/,
    exclude: /(^|\/)(node_modules|\.meteor|_build)(\/|$)/,
    mode: 'eager',
  });
  ctx.keys().forEach(ctx);
}
