type LogJSONInput = {
  message: string;
  app?: string;
  [index: string]: string | object | number | undefined;
};

type LogInput = string | LogJSONInput;

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
  stderr?: string | Error;
};

export declare function Log(input: LogInput, ...optionalParams: any[]): void;

export declare namespace Log {
  var outputFormat: 'json' | 'colored-text';
  function _intercept(count: number): void;
  function _suppress(count: number): void;
  function _intercepted(): string[];
  function _getCallerDetails(): { line: number; file: string };
  function parse(line: object | string): object
  function format(object: formatInput, options: { color: true }): object | string;
  function objFromText(
    line: string,
    override: object
  ): {
    message: string
    level: 'info'
    time: Date
    timeInexact: true
  }

  function debug(input: LogInput, ...optionalParams: any[]): void;
  function info(input: LogInput, ...optionalParams: any[]): void;
  function warn(input: LogInput, ...optionalParams: any[]): void;
  function error(input: LogInput, ...optionalParams: any[]): void;
}
