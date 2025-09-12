import * as vscode from 'vscode';

export class NotificationManager {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('promptsSync');
    }

    private get showNotifications(): boolean {
        return this.config.get('showNotifications', true);
    }

    showInfo(message: string, ...actions: string[]): Thenable<string | undefined> {
        if (!this.showNotifications) {
            return Promise.resolve(undefined);
        }
        return vscode.window.showInformationMessage(message, ...actions);
    }

    showWarning(message: string, ...actions: string[]): Thenable<string | undefined> {
        if (!this.showNotifications) {
            return Promise.resolve(undefined);
        }
        return vscode.window.showWarningMessage(message, ...actions);
    }

    showError(message: string, ...actions: string[]): Thenable<string | undefined> {
        // Always show error messages regardless of settings
        return vscode.window.showErrorMessage(message, ...actions);
    }

    async showSyncSuccess(itemsCount: number): Promise<void> {
        await this.showInfo(`✅ Prompts synced successfully! ${itemsCount} items updated.`);
    }

    async showSyncError(error: string): Promise<void> {
        const result = await this.showError(
            `❌ Failed to sync prompts: ${error}`,
            'Retry',
            'Show Logs'
        );

        if (result === 'Retry') {
            vscode.commands.executeCommand('promptsSync.syncNow');
        } else if (result === 'Show Logs') {
            vscode.commands.executeCommand('workbench.action.output.show');
        }
    }

    async showSyncStart(): Promise<void> {
        await this.showInfo('🔄 Starting prompts sync...');
    }

    async showAuthenticationRequired(): Promise<void> {
        const result = await this.showWarning(
            'GitHub authentication required to sync prompts.',
            'Sign In'
        );

        if (result === 'Sign In') {
            vscode.commands.executeCommand('github.signin');
        }
    }
}
