import * as vscode from 'vscode';

export class NotificationManager {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('promptitude');
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

    async showPartialSyncSuccess(itemsCount: number, successCount: number, totalCount: number, errors: string[]): Promise<void> {
        const message = `⚠️ Partial sync completed! ${itemsCount} items updated from ${successCount}/${totalCount} repositories.`;
        const result = await this.showWarning(
            message,
            'Show Details',
            'Retry Failed'
        );

        if (result === 'Show Details') {
            const details = errors.length > 0 ? 
                `Failed repositories:\n${errors.join('\n')}` : 
                'No error details available';
            await this.showInfo(details);
        } else if (result === 'Retry Failed') {
            vscode.commands.executeCommand('promptitude.syncNow');
        }
    }

    async showSyncError(error: string): Promise<void> {
        const result = await this.showError(
            `❌ Failed to sync prompts: ${error}`,
            'Retry',
            'Show Logs'
        );

        if (result === 'Retry') {
            vscode.commands.executeCommand('promptitude.syncNow');
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
