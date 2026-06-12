export class ToolExtensionError extends Error {
  constructor(message, { code, details } = {}) {
    super(message);
    this.name = 'ToolExtensionError';
    this.code = code || 'TOOL_EXTENSION_ERROR';
    this.details = details || {};
  }
}

export function schemaError(message, details = {}) {
  return new ToolExtensionError(message, {
    code: 'TOOL_EXTENSION_SCHEMA_ERROR',
    details,
  });
}

export function conflictError(message, details = {}) {
  return new ToolExtensionError(message, {
    code: 'TOOL_EXTENSION_CONFLICT',
    details,
  });
}

export function unknownPlatformError(platform, availablePlatforms) {
  return new ToolExtensionError(
    `${platform}: no such platform. Available platforms: ${availablePlatforms.join(', ')}`,
    {
      code: 'TOOL_EXTENSION_UNKNOWN_PLATFORM',
      details: { platform, availablePlatforms },
    }
  );
}
