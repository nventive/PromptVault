import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { StatusBarManager, SyncStatus } from './statusBarManager';
import { Logger } from './utils/logger';
import { NotificationManager } from './utils/notifications';
import { GitHubApiManager, GitHubTreeItem } from './utils/github';
import { FileSystemManager } from './utils/fileSystem';

export interface SyncResult {
    success: boolean;
    itemsUpdated: number;
    error?: string;
}

export class SyncManager {
    private timer: NodeJS.Timeout | null = null;
    private isInitialized = false;
    private context: vscode.ExtensionContext | null = null;
    private notifications: NotificationManager;
    private github: GitHubApiManager;
    private fileSystem: FileSystemManager;

    constructor(
        private config: ConfigManager,
        private statusBar: StatusBarManager,
        private logger: Logger
    ) {
        this.notifications = new NotificationManager();
        this.github = new GitHubApiManager();
        this.fileSystem = new FileSystemManager();
    }

    async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
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
            // Check authentication
            const isAuthenticated = await this.github.checkAuthentication();
            if (!isAuthenticated) {
                this.logger.warn('GitHub authentication required');
                await this.notifications.showAuthenticationRequired();
                
                // Try to authenticate
                const authSuccess = await this.github.requestAuthentication();
                if (!authSuccess) {
                    throw new Error('GitHub authentication failed');
                }
            }

            // Parse repository URL
            const { owner, repo } = this.github.parseRepositoryUrl(this.config.repository);
            this.logger.debug(`Syncing from ${owner}/${repo} branch ${this.config.branch}`);

            // Get repository tree
            const tree = await this.github.getRepositoryTree(owner, repo, this.config.branch);
            this.logger.debug(`Retrieved repository tree with ${tree.tree.length} items`);

            // Filter relevant files
            const relevantFiles = this.filterRelevantFiles(tree.tree);
            this.logger.debug(`Found ${relevantFiles.length} relevant files to sync`);

            // Sync files
            const itemsUpdated = await this.syncFiles(owner, repo, relevantFiles);

            // Update status
            this.statusBar.setStatus(SyncStatus.Success);
            await this.notifications.showSyncSuccess(itemsUpdated);
            
            this.logger.info(`Sync completed successfully. ${itemsUpdated} items updated.`);
            
            // Schedule next sync
            this.scheduleNextSync();

            return { success: true, itemsUpdated };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Sync failed', error instanceof Error ? error : undefined);
            this.statusBar.setStatus(SyncStatus.Error, 'Sync failed');
            await this.notifications.showSyncError(errorMessage);
            
            return { success: false, itemsUpdated: 0, error: errorMessage };
        }
    }

    private filterRelevantFiles(tree: GitHubTreeItem[]): GitHubTreeItem[] {
        const allowedPaths: string[] = [];
        
        // Build list of allowed paths based on settings
        if (this.config.syncChatmode) {
            allowedPaths.push('prompts/chatmode/');
        }
        if (this.config.syncInstructions) {
            allowedPaths.push('prompts/instructions/');
        }
        if (this.config.syncPrompt) {
            allowedPaths.push('prompts/prompt/');
        }

        // If no types are selected, return empty array
        if (allowedPaths.length === 0) {
            this.logger.warn('No sync types selected in configuration');
            return [];
        }

        return tree.filter(item => {
            if (item.type !== 'blob') {
                return false;
            }
            
            return allowedPaths.some(path => item.path.startsWith(path)) &&
                   (item.path.endsWith('.md') || item.path.endsWith('.txt'));
        });
    }

    private async syncFiles(owner: string, repo: string, files: GitHubTreeItem[]): Promise<number> {
        const promptsDir = this.config.getPromptsDirectory();
        await this.fileSystem.ensureDirectoryExists(promptsDir);
        
        let itemsUpdated = 0;

        for (const file of files) {
            try {
                this.logger.debug(`Syncing file: ${file.path}`);
                
                // Get file content from GitHub
                const content = await this.github.getFileContent(owner, repo, file.path, this.config.branch);
                
                // Flatten the structure - extract just the filename and place directly in prompts directory
                const fileName = this.fileSystem.getBasename(file.path);
                const localPath = this.fileSystem.joinPath(promptsDir, fileName);
                
                // Check if file needs updating
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

        const items = [
            'Sync Status',
            '──────────',
            `Enabled: ${this.config.enabled ? '✅' : '❌'}`,
            `Frequency: ${this.config.frequency}`,
            `Repository: ${this.config.repository}`,
            `Branch: ${this.config.branch}`,
            `Prompts Directory: ${this.config.getPromptsDirectory()}`,
            `Sync on Startup: ${this.config.syncOnStartup ? '✅' : '❌'}`,
            `Show Notifications: ${this.config.showNotifications ? '✅' : '❌'}`,
            `Debug Mode: ${this.config.debug ? '✅' : '❌'}`,
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
            '• Sync Now: Ctrl+Shift+P → "Prompts Sync: Sync Now"',
            '• Show Status: Ctrl+Shift+P → "Prompts Sync: Show Status"',
            '• Configure: File → Preferences → Settings → Search "Prompts Sync"'
        ];

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
