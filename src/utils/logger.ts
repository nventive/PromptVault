import * as vscode from 'vscode';

export class Logger {
    // Use a single shared OutputChannel across all Logger instances
    private static sharedChannel: vscode.OutputChannel | undefined;
    private static scopedCache: Map<string, Logger> = new Map();
    private scope?: string;
    private get outputChannel(): vscode.OutputChannel {
        if (!Logger.sharedChannel) {
            Logger.sharedChannel = vscode.window.createOutputChannel('Promptitude');
        }
        return Logger.sharedChannel;
    }

    constructor(scope?: string) {
        this.scope = scope;
    }

    static get(scope: string): Logger {
        const existing = Logger.scopedCache.get(scope);
        if (existing) {
            return existing;
        }
        const logger = new Logger(scope);
        Logger.scopedCache.set(scope, logger);
        return logger;
    }

    private get isDebugEnabled(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('debug', false);
    }

    private log(level: string, message: string): void {
        const timestamp = this.formatTimestamp(new Date());
        const scoped = this.scope ? `[${this.scope}] ${message}` : message;
        const logMessage = `[${timestamp}] [${level}] ${scoped}`;
        
        this.outputChannel.appendLine(logMessage);
    }

    private formatTimestamp(date: Date): string {
        const pad = (n: number, width: number = 2) => n.toString().padStart(width, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        const millis = pad(date.getMilliseconds(), 3);
        // Format: 2025-10-08 01:16:21.132 (local time)
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
    }

    debug(message: string): void {
        if (this.isDebugEnabled) {
            this.log('DEBUG', message);
        }
    }

    info(message: string): void {
        this.log('INFO', message);
    }

    warn(message: string): void {
        this.log('WARN', message);
    }

    error(message: string, error?: Error): void {
        let errorMessage = message;
        if (error) {
            errorMessage += ` - ${error.message}`;
            if (this.isDebugEnabled && error.stack) {
                errorMessage += `\n${error.stack}`;
            }
        }
        this.log('ERROR', errorMessage);
    }

    show(preserveFocus: boolean = false): void {
        this.outputChannel.show(preserveFocus);
    }

    static disposeSharedChannel(): void {
        Logger.sharedChannel?.dispose();
        Logger.sharedChannel = undefined;
        Logger.scopedCache.clear();
    }
}
