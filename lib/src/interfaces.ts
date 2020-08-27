import { LogLevel } from "./types";

export interface ILogger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (...data: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...data: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...data: any) => void;
  logLevel: LogLevel;
}
