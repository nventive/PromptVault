import * as vscode from 'vscode';

export enum SyncStatus {
    Idle = 'idle',
    Syncing = 'syncing',
    Success = 'success',
    Error = 'error'
}

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private currentStatus: SyncStatus = SyncStatus.Idle;
    private lastSyncTime: Date | null = null;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 
            100
        );
        this.statusBarItem.command = 'promptsSync.syncNow';
        this.statusBarItem.show();
        this.updateStatusBar();
    }

    setStatus(status: SyncStatus, message?: string): void {
        this.currentStatus = status;
        
        if (status === SyncStatus.Success) {
            this.lastSyncTime = new Date();
        }

        this.updateStatusBar(message);
    }

    private updateStatusBar(message?: string): void {
        const icons = {
            [SyncStatus.Idle]: '$(cloud)',
            [SyncStatus.Syncing]: '$(sync~spin)',
            [SyncStatus.Success]: '$(check)',
            [SyncStatus.Error]: '$(error)'
        };

        const icon = icons[this.currentStatus];
        let text = `${icon} Prompts`;

        if (message) {
            text += ` - ${message}`;
        } else if (this.lastSyncTime) {
            const timeAgo = this.getTimeAgo(this.lastSyncTime);
            text += ` (${timeAgo})`;
        }

        this.statusBarItem.text = text;
        
        // Update tooltip
        const tooltips = {
            [SyncStatus.Idle]: 'Click to sync prompts',
            [SyncStatus.Syncing]: 'Syncing prompts...',
            [SyncStatus.Success]: `Last sync: ${this.lastSyncTime?.toLocaleString()}`,
            [SyncStatus.Error]: 'Sync failed - Click to retry'
        };

        this.statusBarItem.tooltip = tooltips[this.currentStatus];
    }

    private getTimeAgo(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) {
            return 'just now';
        } else if (diffMins < 60) {
            return `${diffMins}m ago`;
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else {
            return `${diffDays}d ago`;
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
