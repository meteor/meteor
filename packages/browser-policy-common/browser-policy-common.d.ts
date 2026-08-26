export namespace BrowserPolicy {
  var framing: {
    disallow(): void;
    restrictToOrigin(origin: string): void;
    allowAll(): void;
  };

  var content: {
    allowEval(): void;
    allowInlineStyles(): void;
    allowInlineScripts(): Promise<void>;
    allowSameOriginForAll(): void;
    allowDataUrlForAll(): void;
    allowOriginForAll(origin: string): void;
    allowImageOrigin(origin: string): void;
    allowMediaOrigin(origin: string): void;
    allowFontOrigin(origin: string): void;
    allowStyleOrigin(origin: string): void;
    allowScriptOrigin(origin: string): void;
    allowFrameOrigin(origin: string): void;
    allowFrameAncestorsOrigin(origin: string): void;
    allowContentTypeSniffing(): void;
    allowConnectOrigin(origin: string): void;
    allowObjectOrigin(origin: string): void;

    disallowAll(): Promise<void>;
    disallowInlineStyles(): void;
    disallowEval(): void;
    disallowInlineScripts(): Promise<void>;
    disallowFont(): void;
    disallowObject(): void;
    disallowConnect(): void;
  };
}
