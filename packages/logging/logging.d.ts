type LogJSONInput = {
  message: string
  app?: string
  [index: string]: string | object | number
}
type LogInput = string | LogJSONInput

type formatInput = {
  message: string;
  time: Date;
  level: 'debug' | 'info' | 'warn' | 'error'
  timeInexact?: boolean;
  file: string;
  line: number;
  app?: string;
  originApp?: string;
  program?: string;
  satellite?: string;
  stderr?: string | Error
};

export declare function Log(input: LogInput): void;

export declare namespace Log {
  var outputFormat: 'json' | 'colored-text';
  function _intercept(count: number): void;
  function _suppress(count: number): void;
  function _intercepted(): string[];
  function _getCallerDetails(): { line: number; file: string };
  function format(object: formatInput, options: { color: true }): void;

  function debug(input: LogInput): void;
  function info(input: LogInput): void;
  function warn(input: LogInput): void;
  function error(input: LogInput): void;
}
