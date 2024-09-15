import { LogOutputChannel, window } from "vscode";

export const OUTPUT_CHANNEL: LogOutputChannel = window.createOutputChannel("Grug", { log: true });

export class Logger {
  constructor(private name: string) {}

  trace(message: string, ...args: any[]) {
    const prefix = this.logPrefix("trace");
    console.debug(`${prefix} ${message}`, ...args);
    OUTPUT_CHANNEL.trace(`[${this.name}] ${message}`);
  }

  debug(message: string, ...args: any[]) {
    const prefix = this.logPrefix("debug");
    console.debug(`${prefix} ${message}`, ...args);
    OUTPUT_CHANNEL.debug(`[${this.name}] ${message}`);
  }

  info(message: string, ...args: any[]) {
    const prefix = this.logPrefix("info");
    console.info(`${prefix} ${message}`, ...args);
    OUTPUT_CHANNEL.info(`[${this.name}] ${message}`);
  }

  warn(message: string, ...args: any[]) {
    const prefix = this.logPrefix("warn");
    console.warn(`${prefix} ${message}`, ...args);
    OUTPUT_CHANNEL.warn(`[${this.name}] ${message}`);
  }

  error(message: string, ...args: any[]) {
    const prefix = this.logPrefix("error");
    console.error(`${prefix} ${message}`, ...args);
    OUTPUT_CHANNEL.error(`[${this.name}] ${message}`);
  }

  private logPrefix(level: string) {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${this.name}] [${level}]`;
  }
}
