type LogJSONInput = {
  message: string;
  app?: string;
  [index: string]: string | object | number | undefined;
};

type LogInput = string | LogJSONInput;

type formatInput = {
  message: string;
  time: Date;
  level: "debug" | "info" | "warn" | "error";
  timeInexact?: boolean;
  file: string;
  line: number;
  app?: string;
  originApp?: string;
  program?: string;
  satellite?: string;
  stderr?: string | Error;
};

export declare function Log(input: LogInput, ...optionalParams: unknown[]): void;

export declare namespace Log {
  var outputFormat: "json" | "colored-text";
  var showTime: boolean;
  function _intercept(count: number): void;
  function _suppress(count: number): void;
  function _intercepted(): string[];
  function _getCallerDetails(): { line?: string; file?: string };
  function parse(line: string): Record<string, unknown> | null;
  function format(object: formatInput, options?: { color?: boolean; metaColor?: string }): string;
  function objFromText(
    line: string,
    override?: Record<string, unknown>,
  ): {
    message: string;
    level: "info";
    time: Date;
    timeInexact: true;
  } & Record<string, unknown>;

  function debug(input: LogInput, ...optionalParams: unknown[]): void;
  function info(input: LogInput, ...optionalParams: unknown[]): void;
  function warn(input: LogInput, ...optionalParams: unknown[]): void;
  function error(input: LogInput, ...optionalParams: unknown[]): void;
}
