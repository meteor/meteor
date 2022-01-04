export const normalizeProjection = options => {
  // transform fields key in projection
  const { fields, projection, ...otherOptions } = options || {};
  // TODO: enable this comment when deprecating the fields option
  // Log.debug(`fields option has been deprecated, please use the new 'projection' instead`)

  return {
    ...otherOptions,
    ...(projection || fields ? { projection: fields || projection } : {}),
  };
};
