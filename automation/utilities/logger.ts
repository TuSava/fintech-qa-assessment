export class Logger {
  public static info(message: string, context?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  public static warn(message: string, context?: any): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }

  public static error(message: string, context?: any): void {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, context ? JSON.stringify(context, null, 2) : '');
  }
}
