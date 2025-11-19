import * as vscode from 'vscode';
import { GitProviderFactory } from './utils/gitProviderFactory';
import { GitProvider } from './utils/gitProvider';
import { Logger } from './utils/logger';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface SyncFrequency {
    startup: number;
    hourly: number;
    daily: number;
    weekly: number;
    manual: number;
}

export class ConfigManager {
    private static readonly SYNC_FREQUENCIES: SyncFrequency = {
        startup: 0, // Only on startup
        hourly: 60 * 60 * 1000, // 1 hour
        daily: 24 * 60 * 60 * 1000, // 24 hours
        weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
        manual: -1 // Never automatic
    };

    private context?: vscode.ExtensionContext;
    private logger = Logger.get('ConfigManager');

    constructor(context?: vscode.ExtensionContext) {
        this.context = context;
    }

    get enabled(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('enabled', true);
    }

    get frequency(): keyof SyncFrequency {
        return vscode.workspace.getConfiguration('promptitude').get('frequency', 'daily');
    }

    get customPath(): string {
        return vscode.workspace.getConfiguration('promptitude').get('customPath', '');
    }

    get repositories(): string[] {
        const repository = vscode.workspace.getConfiguration('promptitude').get<string[]>('repositories', []);
        const sanitized = repository
            .map(r => (r ?? '').trim())
            .filter(r => r.length > 0);
        const uniqueArray = Array.from(new Set(sanitized));
        if (uniqueArray.length !== repository.length) {
            vscode.window.showWarningMessage('Duplicate repository URLs found in configuration. Duplicates have been removed.');
        }
        return uniqueArray;
    }

    /**
     * Returns repositories with their associated branch. The repositories setting accepts
     * entries in the form "https://github.com/owner/repo", "https://dev.azure.com/org/project/_git/repo", or with branch "repo_url|branch".
     * If no branch is specified, defaults to "main".
     */
    get repositoryConfigs(): { url: string; branch: string }[] {
        return this.repositories.map(entry => {
            const [url, branch] = entry.split('|');
            return { url, branch: (branch && branch.trim()) ? branch.trim() : 'main' };
        });
    }

    get syncOnStartup(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncOnStartup', true);
    }

    get showNotifications(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('showNotifications', true);
    }

    get debug(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('debug', false);
    }

    get syncChatmode(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncChatmode', true);
    }

    get syncInstructions(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncInstructions', false);
    }

    get syncPrompt(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncPrompt', true);
    }

    getSyncInterval(): number {
        return ConfigManager.SYNC_FREQUENCIES[this.frequency];
    }

    getPromptsDirectory(): string {
        if (this.customPath) {
            this.logger.info(`Using custom prompts path: ${this.customPath}`);
            return this.customPath;
        }

        // Use profile-specific storage if context is available
        if (this.context && this.context.globalStorageUri) {
            // globalStorageUri is profile-specific in VS Code
            // Example: /Users/username/Library/Application Support/Code/User/globalStorage/extension-id
            const globalStoragePath = this.context.globalStorageUri.fsPath;
            return path.join(globalStoragePath, 'prompts');
        }

        // Fallback to global user data directory (legacy behavior)
        switch (process.platform) {
            case 'win32':
                return path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User');
            case 'darwin':
                return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
            case 'linux':
                return path.join(os.homedir(), '.config', 'Code', 'User');
            default:
                return path.join(os.homedir(), '.vscode', 'User');
        }
    }

    /**
     * Fallback to hardcoded paths (for backward compatibility when context is not available)
     */
    private getFallbackPromptsDirectory(): string {
        this.logger.warn('Using fallback hardcoded prompts directory paths');

        try {
            let promptsPath: string;
            switch (process.platform) {
                case 'win32':
                    promptsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'prompts');
                    break;
                case 'darwin':
                    promptsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'prompts');
                    break;
                case 'linux':
                    promptsPath = path.join(os.homedir(), '.config', 'Code', 'User', 'prompts');
                    break;
                default:
                    promptsPath = path.join(os.homedir(), '.vscode', 'prompts');
                    break;
            }

            if (this.debug) {
                this.logger.debug(`Fallback prompts directory: ${promptsPath}`);
            }
            return promptsPath;
        } catch (error) {
            // If Node.js modules are not available, use a reasonable default
            // This should not happen in a VS Code extension context, but provides safety
            throw new Error('Unable to determine prompts directory: Node.js environment not available');
        }
    }

    onConfigurationChanged(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('promptitude')) {
                callback();
            }
        });
    }

    /**
     * Get the set of unique Git providers used in the configured repositories
     */
    getUsedProviders(): Set<GitProvider> {
        const providers = new Set<GitProvider>();
        
        // In getUsedProviders():
        for (const repo of this.repositories) {
            const [url] = repo.split('|');
            try {
                const provider = GitProviderFactory.detectProvider(url);
                if (provider !== 'unknown') {
                    providers.add(provider);
                }
            } catch {
                // Ignore invalid URLs
            }
        }
        
        return providers;
    }

    /**
     * Check if any configured repositories use GitHub
     */
    hasGitHubRepositories(): boolean {
        return this.getUsedProviders().has('github');
    }

    /**
     * Check if any configured repositories use Azure DevOps
     */
    hasAzureDevOpsRepositories(): boolean {
        return this.getUsedProviders().has('azure');
    }

    /**
     * Get repositories grouped by provider
     */
    getRepositoriesByProvider(): Map<GitProvider, string[]> {
        const providerMap = new Map<GitProvider, string[]>();
        
        // Sanitize branch suffix before detection
        for (const repo of this.repositories) {
            const [url] = repo.split('|');
            try {
                const provider = GitProviderFactory.detectProvider(url);
                if (provider !== 'unknown') {
                    if (!providerMap.has(provider)) {
                        providerMap.set(provider, []);
                    }
                    providerMap.get(provider)!.push(repo);
                }
            } catch {
                // Ignore invalid URLs
            }
        }

        return providerMap;
    }
}
