import * as vscode from 'vscode';

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

    get enabled(): boolean {
        return vscode.workspace.getConfiguration('promptVault').get('enabled', true);
    }

    get frequency(): keyof SyncFrequency {
        return vscode.workspace.getConfiguration('promptVault').get('frequency', 'daily');
    }

    get customPath(): string {
        return vscode.workspace.getConfiguration('promptVault').get('customPath', '');
    }

    get repositories(): string[] {
        const repository = vscode.workspace.getConfiguration('promptVault').get<string[]>('repositories', []);
        const uniqueArray = Array.from(new Set(repository));
        if(uniqueArray.length != repository.length) {
            vscode.window.showWarningMessage('Duplicate repository URLs found in configuration. Duplicates have been removed.');
        }
        return uniqueArray;
    }

    get branch(): string {
        return vscode.workspace.getConfiguration('promptVault').get('branch', 'main');
    }

    get syncOnStartup(): boolean {
        return vscode.workspace.getConfiguration('promptVault').get('syncOnStartup', true);
    }

    get showNotifications(): boolean {
        return vscode.workspace.getConfiguration('promptVault').get('showNotifications', true);
    }

    get debug(): boolean {
        return vscode.workspace.getConfiguration('promptVault').get('debug', false);
    }

    get syncChatmode(): boolean {
        return vscode.workspace.getConfiguration('promptVault').get('syncChatmode', true);
    }

    get syncInstructions(): boolean {
        return vscode.workspace.getConfiguration('promptVault').get('syncInstructions', false);
    }

    get syncPrompt(): boolean {
        return vscode.workspace.getConfiguration('promptVault').get('syncPrompt', true);
    }

    getSyncInterval(): number {
        return ConfigManager.SYNC_FREQUENCIES[this.frequency];
    }

    getPromptsDirectory(): string {
        if (this.customPath) {
            return this.customPath;
        }

        // Get VS Code user data directory
        const os = require('os');
        const path = require('path');
        
        switch (process.platform) {
            case 'win32':
                return path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'prompts');
            case 'darwin':
                return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'prompts');
            case 'linux':
                return path.join(os.homedir(), '.config', 'Code', 'User', 'prompts');
            default:
                return path.join(os.homedir(), '.vscode', 'prompts');
        }
    }

    onConfigurationChanged(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('promptVault')) {
                callback();
            }
        });
    }
}
