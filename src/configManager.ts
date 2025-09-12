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
        return vscode.workspace.getConfiguration('promptsSync').get('enabled', true);
    }

    get frequency(): keyof SyncFrequency {
        return vscode.workspace.getConfiguration('promptsSync').get('frequency', 'daily');
    }

    get customPath(): string {
        return vscode.workspace.getConfiguration('promptsSync').get('customPath', '');
    }

    get repository(): string {
        return vscode.workspace.getConfiguration('promptsSync').get('repository', 'https://github.com/MounirAbdousNventive/prompts-logient-nventive');
    }

    get branch(): string {
        return vscode.workspace.getConfiguration('promptsSync').get('branch', 'master');
    }

    get syncOnStartup(): boolean {
        return vscode.workspace.getConfiguration('promptsSync').get('syncOnStartup', true);
    }

    get showNotifications(): boolean {
        return vscode.workspace.getConfiguration('promptsSync').get('showNotifications', true);
    }

    get debug(): boolean {
        return vscode.workspace.getConfiguration('promptsSync').get('debug', false);
    }

    get syncChatmode(): boolean {
        return vscode.workspace.getConfiguration('promptsSync').get('syncChatmode', true);
    }

    get syncInstructions(): boolean {
        return vscode.workspace.getConfiguration('promptsSync').get('syncInstructions', true);
    }

    get syncPrompt(): boolean {
        return vscode.workspace.getConfiguration('promptsSync').get('syncPrompt', true);
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
            if (event.affectsConfiguration('promptsSync')) {
                callback();
            }
        });
    }
}
