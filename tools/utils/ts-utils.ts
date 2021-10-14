export function isErrnoException(e: unknown): e is NodeJS.ErrnoException {
  if ('code' in (e as any)) return true;
  else return false;
}

export function isErrorWithErrno(e: unknown): e is Error & { errno: number } {
  if ('errno' in (e as any)) return true;
  else return false;
}

export function isParserError(e: unknown): e is ParserError {
  if ('loc' in (e as any)) return true;
  else return false;
}

export type ParserError = {
  loc: {
    line: number;
    column: number;
  };
  message: string;
  $ParseError: boolean;
};
