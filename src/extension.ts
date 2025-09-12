import * as vscode from 'vscode';
import { SyncManager } from './syncManager';
import { StatusBarManager } from './statusBarManager';
import { ConfigManager } from './configManager';
import { Logger } from './utils/logger';

let syncManager: SyncManager;
let statusBarManager: StatusBarManager;
let logger: Logger;

export function activate(context: vscode.ExtensionContext) {
    logger = new Logger();
    logger.info('Prompts Sync Extension is activating...');

    const configManager = new ConfigManager();
    statusBarManager = new StatusBarManager();
    syncManager = new SyncManager(configManager, statusBarManager, logger);

    // Register commands
    const syncNowCommand = vscode.commands.registerCommand('promptsSync.syncNow', async () => {
        await syncManager.syncNow();
    });

    const showStatusCommand = vscode.commands.registerCommand('promptsSync.showStatus', async () => {
        await syncManager.showStatus();
    });

    // Add to subscriptions
    context.subscriptions.push(syncNowCommand);
    context.subscriptions.push(showStatusCommand);
    context.subscriptions.push(statusBarManager);

    // Initialize sync manager
    syncManager.initialize(context);

    logger.info('Prompts Sync Extension activated successfully');
}

export function deactivate() {
    logger?.info('Prompts Sync Extension is deactivating...');
    syncManager?.dispose();
    statusBarManager?.dispose();
}
