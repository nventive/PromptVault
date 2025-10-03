import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { StatusBarManager, SyncStatus } from './statusBarManager';
import { Logger } from './utils/logger';
import { NotificationManager } from './utils/notifications';
import { GitApiManager, GitTreeItem } from './utils/gitProvider';
import { GitProviderFactory } from './utils/gitProviderFactory';
import { FileSystemManager } from './utils/fileSystem';
import { AzureDevOpsApiManager } from './utils/azureDevOps';
import { REPO_SYNC_CHAT_MODE_PATH, REPO_SYNC_INSTRUCTIONS_PATH, REPO_SYNC_PROMPT_PATH,  } from './constant';
export interface SyncResult {
    success: boolean;
    itemsUpdated: number;
    error?: string;
}

export interface RepositorySyncResult {
    repository: string;
    success: boolean;
    itemsUpdated: number;
    error?: string;
}

export interface MultiRepositorySyncResult {
    overallSuccess: boolean;
    totalItemsUpdated: number;
    repositories: RepositorySyncResult[];
    errors: string[];
}

export class SyncManager {
    private timer: NodeJS.Timeout | null = null;
    private isInitialized = false;
    private context: vscode.ExtensionContext | null = null;
    private notifications: NotificationManager;
    private fileSystem: FileSystemManager;
    private gitProviders: Map<string, GitApiManager> = new Map();

    constructor(
        private config: ConfigManager,
        private statusBar: StatusBarManager,
        private logger: Logger
    ) {
        this.notifications = new NotificationManager(this.config);
        this.fileSystem = new FileSystemManager();
    }

    async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        
        // Update notification manager with extension context
        this.notifications = new NotificationManager(this.config, this.context);
        
        this.logger.info('Initializing SyncManager...');

        // Listen for configuration changes
        const configDisposable = this.config.onConfigurationChanged(() => {
            this.logger.debug('Configuration changed, reinitializing sync schedule');
            this.scheduleNextSync();
        });

        context.subscriptions.push(configDisposable);

        // Perform initial sync if enabled
        if (this.config.enabled && this.config.syncOnStartup) {
            this.logger.info('Performing initial sync on startup');
            setTimeout(() => this.syncNow(), 2000); // Delay to let VS Code finish loading
        }

        // Schedule periodic syncs
        this.scheduleNextSync();
        this.isInitialized = true;
        
        this.logger.info('SyncManager initialized successfully');
    }

    async syncNow(): Promise<SyncResult> {
        if (!this.config.enabled) {
            this.logger.info('Sync is disabled in configuration');
            return { success: false, itemsUpdated: 0, error: 'Sync disabled' };
        }

        this.logger.info('Starting manual sync...');
        this.statusBar.setStatus(SyncStatus.Syncing, 'Syncing...');

        try {
            const repositories = this.config.repositories;
            this.logger.info(`Syncing from ${repositories.length} repositories`);

            const result = await this.syncMultipleRepositories(repositories);

            // Update status based on overall result
            if (result.overallSuccess) {
                this.statusBar.setStatus(SyncStatus.Success);
                await this.notifications.showSyncSuccess(result.totalItemsUpdated);
                this.logger.info(`Sync completed successfully. ${result.totalItemsUpdated} items updated across ${repositories.length} repositories.`);
            } else {
                // Partial success or complete failure
                const successCount = result.repositories.filter(r => r.success).length;
                if (successCount > 0) {
                    this.statusBar.setStatus(SyncStatus.Success, `${successCount}/${repositories.length} repos synced`);
                    await this.notifications.showPartialSyncSuccess(result.totalItemsUpdated, successCount, repositories.length, result.errors);
                    this.logger.warn(`Partial sync completed. ${result.totalItemsUpdated} items updated from ${successCount}/${repositories.length} repositories.`);
                } else {
                    this.statusBar.setStatus(SyncStatus.Error, 'All repos failed');
                    await this.notifications.showSyncError(`All repositories failed: ${result.errors.join('; ')}`);
                    this.logger.error('All repositories failed to sync');
                }
            }
            
            // Schedule next sync
            this.scheduleNextSync();

            return { 
                success: result.overallSuccess, 
                itemsUpdated: result.totalItemsUpdated, 
                error: result.errors.length > 0 ? result.errors.join('; ') : undefined 
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Sync failed', error instanceof Error ? error : undefined);
            this.statusBar.setStatus(SyncStatus.Error, 'Sync failed');
            await this.notifications.showSyncError(errorMessage);
            
            return { success: false, itemsUpdated: 0, error: errorMessage };
        }
    }

    private filterRelevantFiles(tree: GitTreeItem[]): GitTreeItem[] {
        const allowedPaths: string[] = [];
        
        // Build list of allowed paths based on settings
        if (this.config.syncChatmode) {
            allowedPaths.push(REPO_SYNC_CHAT_MODE_PATH);
        }
        if (this.config.syncInstructions) {
            allowedPaths.push(REPO_SYNC_INSTRUCTIONS_PATH);
        }
        if (this.config.syncPrompt) {
            allowedPaths.push(REPO_SYNC_PROMPT_PATH);
        }

        // If no types are selected, return empty array
        if (allowedPaths.length === 0) {
            this.logger.warn('No sync types selected in configuration');
            return [];
        }

        const filtered = tree.filter(item => {
            const isBlob = item.type === 'blob';
            
            // Normalize path separators and remove leading slash for comparison
            const normalizedPath = item.path.replace(/\\/g, '/').replace(/^\/+/, '');
            
            const matchesPath = allowedPaths.some(path => {
                const normalizedAllowedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
                return normalizedPath.startsWith(normalizedAllowedPath);
            });
            
            // Support more file extensions including .prompt.md
            const isRelevantFile = item.path.endsWith('.md') || 
                                 item.path.endsWith('.txt');
            
            this.logger.debug(`  ${item.path}: blob=${isBlob}, matchesPath=${matchesPath}, isRelevantFile=${isRelevantFile} (normalized: ${normalizedPath})`);
            
            return isBlob && matchesPath && isRelevantFile;
        });
        
        console.log(`Filtered result: ${filtered.length} files out of ${tree.length} total`);
        return filtered;
    }

    private async syncFiles(gitApi: GitApiManager, owner: string, repo: string, files: GitTreeItem[], branch: string): Promise<number> {
        const promptsDir = this.config.getPromptsDirectory();
        await this.fileSystem.ensureDirectoryExists(promptsDir);
        
        let itemsUpdated = 0;

        for (const file of files) {
            this.logger.debug(`Syncing file: ${file.path}`);
            let content = null;

            try {
                content = await gitApi.getFileContent(owner, repo, file.path, branch);
            } catch (error) {
                // An error occurred while retrieving file content, Return here
                this.logger.warn(`Failed to fetch content for ${file.path}: ${error}`);
                this.notifications.showSyncError(`Failed to fetch content for ${file.path} branch:${branch}: ${error}.`);
                return itemsUpdated;
            }

            try {
                // Flatten the structure - extract just the filename and place directly in prompts directory
                const fileName = this.fileSystem.getBasename(file.path);
                const localPath = this.fileSystem.joinPath(promptsDir, fileName);
                
                // Check if file needs updating
                if(!content) {
                    this.logger.warn(`No content retrieved for ${file.path}, skipping`);
                    continue;
                }
                const needsUpdate = await this.shouldUpdateFile(localPath, content);
                
                if (needsUpdate) {
                    await this.fileSystem.writeFileContent(localPath, content);
                    itemsUpdated++;
                    this.logger.debug(`Updated file: ${localPath}`);
                } else {
                    this.logger.debug(`File unchanged: ${localPath}`);
                }
                
            } catch (error) {
                this.logger.warn(`Failed to sync file ${file.path}: ${error}`);
                // Continue with other files even if one fails
            }
        }

        return itemsUpdated;
    }

    private async syncMultipleRepositories(repositories: string[]): Promise<MultiRepositorySyncResult> {
        const results: RepositorySyncResult[] = [];
        let totalItemsUpdated = 0;
        const errors: string[] = [];

        const repoConfigs = this.config.repositoryConfigs;

        for (const entry of repoConfigs) {
            const repoUrl = entry.url;
            const branch = entry.branch;
            try {
                this.logger.debug(`Syncing repository: ${repoUrl}`);
                
                // Get or create Git API manager for this repository
                let gitApi = this.gitProviders.get(repoUrl);
                if (!gitApi) {
                    if (!this.context) {
                        throw new Error('Extension context not available for git provider initialization');
                    }
                    gitApi = GitProviderFactory.createFromUrl(repoUrl, this.context);
                    this.gitProviders.set(repoUrl, gitApi);
                }

                // Check authentication for this provider
                // First check if we’re already authenticated
                let isAuthenticated = await gitApi.checkAuthentication();
                if (!isAuthenticated) {
                    this.logger.warn(`${gitApi.getProviderName()} authentication required for ${repoUrl}`);
                    await this.notifications.showAuthenticationRequired();

                    // Re-check after the notification flow before prompting again
                    isAuthenticated = await gitApi.checkAuthentication();
                    if (!isAuthenticated) {
                        const authSuccess = await gitApi.requestAuthentication();
                        if (!authSuccess) {
                            throw new Error(`${gitApi.getProviderName()} authentication failed`);
                        }
                    }
                }
                
                // Parse repository URL
                const { owner, repo } = gitApi.parseRepositoryUrl(repoUrl);
                this.logger.debug(`Syncing from ${owner}/${repo} branch ${branch}`);

                // Get repository tree
                const tree = await gitApi.getRepositoryTree(owner, repo, branch);
                this.logger.debug(`Retrieved repository tree with ${tree.tree.length} items for ${repoUrl}`);
                
                // Debug: Log all items in the tree to see what's actually there
                console.log('Repository tree contents:');
                tree.tree.forEach((item, index) => {
                    console.log(`  ${index + 1}. ${item.path} (type: ${item.type})`);
                });

                // Filter relevant files
                const relevantFiles = this.filterRelevantFiles(tree.tree);
                
                if(relevantFiles.length === 0) {
                    this.logger.warn(`No relevant files found to sync in ${repoUrl} based on current settings`);
                    const promptLocation = `${REPO_SYNC_CHAT_MODE_PATH}, ${REPO_SYNC_INSTRUCTIONS_PATH}, ${REPO_SYNC_PROMPT_PATH}`;
                    results.push({
                        repository: repoUrl,
                        success: false,
                        itemsUpdated: 0,
                        error: `No relevant files found, make sure prompts are in valid directories: ${promptLocation}`
                    });
                    errors.push(`${repoUrl}: No relevant files found`);
                    continue;
                }
                this.logger.debug(`Found ${relevantFiles.length} relevant files to sync for ${repoUrl}`);

                // Sync files
                const itemsUpdated = await this.syncFiles(gitApi, owner, repo, relevantFiles, branch);
                
                results.push({
                    repository: repoUrl,
                    success: true,
                    itemsUpdated,
                });

                totalItemsUpdated += itemsUpdated;
                this.logger.info(`Successfully synced ${itemsUpdated} items from ${repoUrl}`);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.logger.warn(`Failed to sync repository ${repoUrl}: ${errorMessage}`);
                
                results.push({
                    repository: repoUrl,
                    success: false,
                    itemsUpdated: 0,
                    error: errorMessage
                });

                errors.push(`${repoUrl}: ${errorMessage}`);
            }
        }

        const overallSuccess = results.every(r => r.success);
        
        return {
            overallSuccess,
            totalItemsUpdated,
            repositories: results,
            errors
        };
    }

    private async shouldUpdateFile(localPath: string, newContent: string): Promise<boolean> {
        try {
            if (!(await this.fileSystem.fileExists(localPath))) {
                return true; // File doesn't exist, needs to be created
            }

            const existingContent = await this.fileSystem.readFileContent(localPath);
            return existingContent !== newContent;
        } catch {
            return true; // Error reading file, assume it needs updating
        }
    }

    private scheduleNextSync(): void {
        // Clear existing timer
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (!this.config.enabled) {
            this.logger.debug('Sync disabled, not scheduling next sync');
            return;
        }

        const interval = this.config.getSyncInterval();
        
        if (interval <= 0) {
            this.logger.debug('Manual sync mode, not scheduling automatic sync');
            return;
        }

        this.logger.debug(`Scheduling next sync in ${interval}ms (${this.config.frequency})`);
        
        this.timer = setTimeout(() => {
            this.logger.info(`Automatic sync triggered (${this.config.frequency})`);
            this.syncNow();
        }, interval);
    }

    async showStatus(): Promise<void> {
        const syncTypes = [];
        if (this.config.syncChatmode) {
            syncTypes.push('Chatmode');
        }
        if (this.config.syncInstructions) {
            syncTypes.push('Instructions');
        }
        if (this.config.syncPrompt) {
            syncTypes.push('Prompt');
        }

        const repositories = this.config.repositories;
        const repoConfigs = this.config.repositoryConfigs;
        
        // Check authentication status for different providers
        const usedProviders = this.config.getUsedProviders();
        const authStatus: string[] = [];
        
        if (usedProviders.has('github')) {
            try {
                const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
                authStatus.push(`GitHub: ${session ? '✅ Authenticated' : '❌ Not authenticated'}`);
            } catch {
                authStatus.push('GitHub: ❌ Not authenticated');
            }
        }
        
        if (usedProviders.has('azure') && this.context) {
            try {
                const azureManager = new AzureDevOpsApiManager(this.context);
                const hasValidPAT = await azureManager.hasValidPAT();
                authStatus.push(`Azure DevOps: ${hasValidPAT ? '✅ PAT configured' : '❌ PAT not configured'}`);
            } catch {
                authStatus.push('Azure DevOps: ❌ PAT not configured');
            }
        }
        
        const items = [
            'Sync Status',
            '──────────',
            `Enabled: ${this.config.enabled ? '✅' : '❌'}`,
            `Frequency: ${this.config.frequency}`,
            `Branches: ${repoConfigs.length > 0 ? repoConfigs.map(rc => rc.branch).join(', ') : 'main'}`,
            `Prompts Directory: ${this.config.getPromptsDirectory()}`,
            `Sync on Startup: ${this.config.syncOnStartup ? '✅' : '❌'}`,
            `Show Notifications: ${this.config.showNotifications ? '✅' : '❌'}`,
            `Debug Mode: ${this.config.debug ? '✅' : '❌'}`,
        ];
        
        // Add authentication section if there are providers to show
        if (authStatus.length > 0) {
            items.push(
                '',
                'Authentication',
                '──────────────'
            );
            authStatus.forEach(status => items.push(status));
        }

        items.push(
            '',
            'Repositories',
            '────────────',
            `Count: ${repositories.length}`,
        );

        // Add each repository
        repoConfigs.forEach((rc, index) => {
            items.push(`${index + 1}. ${rc.url} (branch: ${rc.branch})`);
        });

        items.push(
            '',
            'Sync Types',
            '──────────',
            `Chatmode: ${this.config.syncChatmode ? '✅' : '❌'}`,
            `Instructions: ${this.config.syncInstructions ? '✅' : '❌'}`,
            `Prompt: ${this.config.syncPrompt ? '✅' : '❌'}`,
            `Active Types: ${syncTypes.length > 0 ? syncTypes.join(', ') : 'None'}`,
            '',
            'Commands',
            '────────',
            '• Sync Now: Ctrl+Shift+P → "Promptitude: Sync Now"',
            '• Show Status: Ctrl+Shift+P → "Promptitude: Show Status"',
            '• Open Prompts Folder: Ctrl+Shift+P → "Promptitude: Open Prompts Folder"',
            '',
            'Authentication Management',
            '───────────────────────',
            '• Setup Azure DevOps: Ctrl+Shift+P → "Promptitude: Setup Azure DevOps Authentication"',
            '• Update Azure DevOps PAT: Ctrl+Shift+P → "Promptitude: Update Azure DevOps Personal Access Token"',
            '• Clear Azure DevOps Auth: Ctrl+Shift+P → "Promptitude: Clear Azure DevOps Authentication"',
            '',
            'Configuration',
            '─────────────',
            '• Settings: File → Preferences → Settings → Search "Promptitude"'
        );

        const quickPick = vscode.window.createQuickPick();
        quickPick.items = items.map(item => ({ label: item }));
        quickPick.title = 'Prompts Sync Extension Status';
        quickPick.placeholder = 'Extension status and configuration';
        quickPick.canSelectMany = false;
        
        quickPick.onDidAccept(() => {
            quickPick.hide();
        });

        quickPick.show();
    }

    async openPromptsFolder(): Promise<void> {
        try {
            const promptsDir = this.config.getPromptsDirectory();
            
            // Ensure directory exists
            await this.fileSystem.ensureDirectoryExists(promptsDir);
            
            // Open folder in system file explorer
            const folderUri = vscode.Uri.file(promptsDir);
            await vscode.commands.executeCommand('revealFileInOS', folderUri);
            
            this.logger.info(`Opened prompts folder: ${promptsDir}`);
            
            // Show info message
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to open prompts folder', error instanceof Error ? error : undefined);
            await this.notifications.showError(`Failed to open prompts folder: ${errorMessage}`);
        }
    }

    dispose(): void {
        this.logger.info('Disposing SyncManager...');
        
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        this.isInitialized = false;
        this.logger.info('SyncManager disposed');
    }
}
