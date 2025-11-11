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

  // Compare two MongoDB Timestamps (clusterTime). Returns -1, 0, 1
export function compareOperationTimes(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    // Support different BSON Timestamp shapes
    const aHigh = typeof a.getHighBits === 'function' ? a.getHighBits() : (a.t ?? a.seconds ?? a.time ?? 0);
    const aLow  = typeof a.getLowBits === 'function' ? a.getLowBits()  : (a.i ?? a.increment ?? 0);
    const bHigh = typeof b.getHighBits === 'function' ? b.getHighBits() : (b.t ?? b.seconds ?? b.time ?? 0);
    const bLow  = typeof b.getLowBits === 'function' ? b.getLowBits()  : (b.i ?? b.increment ?? 0);
    if (aHigh > bHigh) return 1;
    if (aHigh < bHigh) return -1;
    if (aLow > bLow) return 1;
    if (aLow < bLow) return -1;
    return 0;
  }
