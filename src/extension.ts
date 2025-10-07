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
    logger.info('Promptitude Extension is activating...');

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
    const addAzureDevOpsPATCommand = vscode.commands.registerCommand('promptitude.addAzureDevOpsPAT', async () => {
        try {
            const azureManager = new AzureDevOpsApiManager(context);
            const success = await azureManager.requestAuthentication();
            
            if (success) {
                const patCount = await azureManager.getPATCount();
                vscode.window.showInformationMessage(`✅ Azure DevOps PAT added successfully! (Total: ${patCount})`);
            } else {
                vscode.window.showWarningMessage('Adding Azure DevOps PAT was cancelled.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to add Azure DevOps PAT: ${errorMessage}`);
        }
    });

    const clearAzureDevOpsPATCommand = vscode.commands.registerCommand('promptitude.clearAzureDevOpsPAT', async () => {
        try {
            const azureManager = new AzureDevOpsApiManager(context);
            const patCount = await azureManager.getPATCount();
            
            if (patCount === 0) {
                vscode.window.showInformationMessage('No Azure DevOps PATs configured to clear.');
                return;
            }
            
            // Show options to remove specific PAT or all
            const items = [];
            for (let i = 0; i < patCount; i++) {
                items.push({
                    label: `$(key) PAT ${i + 1}`,
                    description: `Remove PAT at position ${i + 1}`,
                    index: i
                });
            }
            items.push({
                label: '$(trash) Remove All PATs',
                description: `Remove all ${patCount} PAT(s)`,
                index: -1
            });
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `You have ${patCount} PAT(s) configured. Select which to remove:`
            });
            
            if (!selected) {
                return;
            }
            
            if (selected.index === -1) {
                // Remove all
                const confirm = await vscode.window.showWarningMessage(
                    `Are you sure you want to remove all ${patCount} Azure DevOps PAT(s)? You will need to re-enter them to sync from Azure DevOps repositories.`,
                    'Yes, Remove All',
                    'Cancel'
                );
                
                if (confirm === 'Yes, Remove All') {
                    await azureManager.clearAllPATs();
                    vscode.window.showInformationMessage('✅ All Azure DevOps PATs removed successfully.');
                }
            } else {
                // Remove specific PAT
                const confirm = await vscode.window.showWarningMessage(
                    `Are you sure you want to remove PAT ${selected.index + 1}?`,
                    'Yes, Remove',
                    'Cancel'
                );
                
                if (confirm === 'Yes, Remove') {
                    await azureManager.removePAT(selected.index);
                    vscode.window.showInformationMessage(`✅ PAT ${selected.index + 1} removed successfully.`);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to clear Azure DevOps PATs: ${errorMessage}`);
        }
    });

    const clearAzureDevOpsCacheCommand = vscode.commands.registerCommand('promptitude.clearAzureDevOpsCache', async () => {
        try {
            const azureManager = new AzureDevOpsApiManager(context);
            const cachedOrgs = await azureManager.getCachedOrganizations();
            
            if (cachedOrgs.length === 0) {
                vscode.window.showInformationMessage('No Azure DevOps cache to clear.');
                return;
            }
            
            const confirm = await vscode.window.showWarningMessage(
                `Clear Azure DevOps authentication cache for ${cachedOrgs.length} organization(s)? This will force re-authentication on the next sync.`,
                'Yes, Clear Cache',
                'Cancel'
            );
            
            if (confirm === 'Yes, Clear Cache') {
                await azureManager.clearCache();
                vscode.window.showInformationMessage(`✅ Azure DevOps cache cleared for ${cachedOrgs.length} organization(s).`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to clear Azure DevOps cache: ${errorMessage}`);
        }
    });

    // Add to subscriptions
    context.subscriptions.push(syncNowCommand);
    context.subscriptions.push(showStatusCommand);
    context.subscriptions.push(openPromptsFolderCommand);
    context.subscriptions.push(addAzureDevOpsPATCommand);
    context.subscriptions.push(clearAzureDevOpsPATCommand);
    context.subscriptions.push(clearAzureDevOpsCacheCommand);
    context.subscriptions.push(statusBarManager);

    // Initialize sync manager
    syncManager.initialize(context);

    logger.info('Promptitude Extension activated successfully');
}

export function deactivate() {
    logger?.info('Promptitude Extension is deactivating...');
    syncManager?.dispose();
    statusBarManager?.dispose();
}
