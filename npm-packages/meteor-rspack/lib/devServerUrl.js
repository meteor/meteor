function formatDevServerHost(host) {
  const value = host || "localhost";
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

module.exports = { formatDevServerHost };
