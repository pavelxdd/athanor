/**
 * Logger utility for conditional logging based on environment
 */
export class Logger {
  private static isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  private static isDev = process.env.NODE_ENV === 'development';

  static log(message: string, ...args: any[]): void {
    if (!this.isTest) {
      console.log(message, ...args);
    }
  }

  static error(message: string, ...args: any[]): void {
    // Always log errors, even in tests (but can be mocked in tests)
    console.error(message, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    if (!this.isTest) {
      console.warn(message, ...args);
    }
  }

  static debug(message: string, ...args: any[]): void {
    if (this.isDev && !this.isTest) {
      console.debug(message, ...args);
    }
  }
}