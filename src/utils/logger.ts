import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Prompts Sync');
    }

    private get isDebugEnabled(): boolean {
        return vscode.workspace.getConfiguration('promptsSync').get('debug', false);
    }

    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        this.outputChannel.appendLine(logMessage);
        
        // Also log to console for debugging
        console.log(`Prompts Sync: ${logMessage}`);
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

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
