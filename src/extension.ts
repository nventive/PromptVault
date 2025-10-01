import * as vscode from 'vscode';
import { SyncManager } from './syncManager';
import { StatusBarManager } from './statusBarManager';
import { ConfigManager } from './configManager';
import { Logger } from './utils/logger';
import { AzureDevOpsApiManager } from './utils/azureDevOps';

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
    const syncNowCommand = vscode.commands.registerCommand('promptitude.syncNow', async () => {
        await syncManager.syncNow();
    });

    const showStatusCommand = vscode.commands.registerCommand('promptitude.showStatus', async () => {
        await syncManager.showStatus();
    });

    const openPromptsFolderCommand = vscode.commands.registerCommand('promptitude.openPromptsFolder', async () => {
        await syncManager.openPromptsFolder();
    });

    // Azure DevOps PAT management commands
    const setupAzureDevOpsCommand = vscode.commands.registerCommand('promptitude.setupAzureDevOps', async () => {
        try {
            const azureManager = new AzureDevOpsApiManager(context);
            const success = await azureManager.requestAuthentication();
            
            if (success) {
                vscode.window.showInformationMessage('✅ Azure DevOps authentication configured successfully!');
            } else {
                vscode.window.showWarningMessage('Azure DevOps setup was cancelled.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to setup Azure DevOps authentication: ${errorMessage}`);
        }
    });

    const updateAzureDevOpsPATCommand = vscode.commands.registerCommand('promptitude.updateAzureDevOpsPAT', async () => {
        try {
            const azureManager = new AzureDevOpsApiManager(context);
            
            // Check if user has existing PAT
            const hasExistingPAT = await azureManager.hasValidPAT();
            let confirmUpdate = true;
            
            if (hasExistingPAT) {
                const result = await vscode.window.showWarningMessage(
                    'You already have an Azure DevOps Personal Access Token configured. Do you want to replace it?',
                    'Yes, Replace Token',
                    'Cancel'
                );
                confirmUpdate = result === 'Yes, Replace Token';
            }
            
            if (confirmUpdate) {
                const success = await azureManager.requestAuthentication();
                
                if (success) {
                    vscode.window.showInformationMessage('✅ Azure DevOps Personal Access Token updated successfully!');
                } else {
                    vscode.window.showWarningMessage('Token update was cancelled.');
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to update Azure DevOps token: ${errorMessage}`);
        }
    });

    const clearAzureDevOpsPATCommand = vscode.commands.registerCommand('promptitude.clearAzureDevOpsPAT', async () => {
        try {
            const azureManager = new AzureDevOpsApiManager(context);
            
            // Check if user has existing PAT
            const hasExistingPAT = await azureManager.hasValidPAT();
            
            if (!hasExistingPAT) {
                vscode.window.showInformationMessage('No Azure DevOps authentication found to clear.');
                return;
            }
            
            const result = await vscode.window.showWarningMessage(
                'Are you sure you want to clear your Azure DevOps authentication? You will need to re-enter your Personal Access Token to sync from Azure DevOps repositories.',
                'Yes, Clear Authentication',
                'Cancel'
            );
            
            if (result === 'Yes, Clear Authentication') {
                await azureManager.clearPersonalAccessToken();
                vscode.window.showInformationMessage('✅ Azure DevOps authentication cleared successfully.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to clear Azure DevOps authentication: ${errorMessage}`);
        }
    });

    // Add to subscriptions
    context.subscriptions.push(syncNowCommand);
    context.subscriptions.push(showStatusCommand);
    context.subscriptions.push(openPromptsFolderCommand);
    context.subscriptions.push(setupAzureDevOpsCommand);
    context.subscriptions.push(updateAzureDevOpsPATCommand);
    context.subscriptions.push(clearAzureDevOpsPATCommand);
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
