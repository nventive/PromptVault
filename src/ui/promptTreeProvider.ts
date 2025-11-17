import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigManager } from '../configManager';
import { FileSystemManager } from '../utils/fileSystem';
import { Logger } from '../utils/logger';
import { decodeRepositorySlug, isLegacySlug, legacySlugToUrl } from '../storage/repositoryStorage';

export interface PromptInfo {
    name: string;
    path: string;
    type: 'chatmode' | 'instructions' | 'prompts';
    size: number;
    lastModified: Date;
    lineCount: number;
    active: boolean;
    repositoryUrl?: string; // The repository URL this prompt came from
    description?: string; // Extracted description from prompt content
}

export class PromptTreeItem extends vscode.TreeItem {
    constructor(
        public readonly promptInfo: PromptInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(promptInfo.name, collapsibleState);
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.contextValue = 'prompt';
        this.command = {
            command: 'prompts.viewPrompt',
            title: 'View Prompt',
            arguments: [this.promptInfo]
        };
        this.iconPath = this.getIcon();
    }

    private getTooltip(): string {
        const sizeKb = (this.promptInfo.size / 1024).toFixed(1);
        return `${this.promptInfo.name}\nType: ${this.promptInfo.type}\nSize: ${sizeKb} KB\nLines: ${this.promptInfo.lineCount}\nModified: ${this.promptInfo.lastModified.toLocaleDateString()}`;
    }

    private getDescription(): string {
        const sizeKb = (this.promptInfo.size / 1024).toFixed(1);
        return `${sizeKb}KB • ${this.promptInfo.lineCount} lines`;
    }

    private getIcon(): vscode.ThemeIcon {
        const baseIcon = this.getTypeIcon();
        if (this.promptInfo.active) {
            return new vscode.ThemeIcon(baseIcon.id, new vscode.ThemeColor('charts.green'));
        }
        return baseIcon;
    }

    private getTypeIcon(): vscode.ThemeIcon {
        switch (this.promptInfo.type) {
            case 'chatmode':
                return new vscode.ThemeIcon('comment-discussion');
            case 'instructions':
                return new vscode.ThemeIcon('book');
            case 'prompts':
                return new vscode.ThemeIcon('code');
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}

export class CategoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly category: string,
        public readonly count: number,
        public readonly activeCount: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(category, collapsibleState);
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.contextValue = 'category';
        this.iconPath = this.getIcon();
    }

    private getTooltip(): string {
        return `${this.category}\n${this.count} prompts (${this.activeCount} active)`;
    }

    private getDescription(): string {
        return `${this.count} (${this.activeCount} active)`;
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.category.toLowerCase()) {
            case 'chatmode':
                return new vscode.ThemeIcon('comment-discussion');
            case 'instructions':
                return new vscode.ThemeIcon('book');
            case 'prompts':
                return new vscode.ThemeIcon('code');
            default:
                return new vscode.ThemeIcon('folder');
        }
    }
}

export class PromptTreeDataProvider implements vscode.TreeDataProvider<PromptTreeItem | CategoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PromptTreeItem | CategoryTreeItem | undefined | null | void> = new vscode.EventEmitter<PromptTreeItem | CategoryTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PromptTreeItem | CategoryTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private prompts: Map<string, PromptInfo[]> = new Map();
    private activePrompts: Set<string> = new Set();
    private logger: Logger;
    private fileSystem: FileSystemManager;
    private isLoading = false;

    constructor(private config: ConfigManager) {
        this.logger = Logger.get('PromptTreeDataProvider');
        this.fileSystem = new FileSystemManager();
        // Trigger initial load asynchronously
        this.initialLoad();
    }

    private async initialLoad(): Promise<void> {
        try {
            this.logger.debug('Starting initial prompt load');
            await this.loadPrompts();
            this._onDidChangeTreeData.fire();
            this.logger.debug('Initial prompt load completed');
        } catch (error) {
            this.logger.error('Failed to perform initial prompt load', error instanceof Error ? error : undefined);
        }
    }

    refresh(): void {
        if (this.isLoading) {
            this.logger.debug('Refresh already in progress, skipping concurrent refresh');
            return;
        }
        
        this.logger.debug('Starting tree refresh');
        this.refreshAsync();
    }

    private async refreshAsync(): Promise<void> {
        try {
            await this.loadPrompts();
            this._onDidChangeTreeData.fire();
        } catch (error) {
            this.logger.error('Failed to refresh prompts', error instanceof Error ? error : undefined);
        }
    }

    getTreeItem(element: PromptTreeItem | CategoryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: PromptTreeItem | CategoryTreeItem): Thenable<(PromptTreeItem | CategoryTreeItem)[]> {
        if (!element) {
            // Root level - return categories
            // Ensure prompts are loaded before returning categories
            return this.ensurePromptsLoaded().then(() => this.getCategories());
        }

        if (element instanceof CategoryTreeItem) {
            // Return prompts for this category
            return Promise.resolve(this.getPromptsForCategory(element.category));
        }

        return Promise.resolve([]);
    }

    private async ensurePromptsLoaded(): Promise<void> {
        // If prompts map is empty and we're not currently loading, trigger a load
        if (this.prompts.size === 0 && !this.isLoading) {
            this.logger.debug('No prompts loaded, triggering load in getChildren');
            await this.loadPrompts();
        }
    }

    private getCategories(): CategoryTreeItem[] {
        const categories: CategoryTreeItem[] = [];
        
        for (const [category, prompts] of this.prompts.entries()) {
            const activeCount = prompts.filter(p => p.active).length;
            categories.push(new CategoryTreeItem(
                this.getCategoryDisplayName(category),
                prompts.length,
                activeCount,
                vscode.TreeItemCollapsibleState.Expanded
            ));
        }

        return categories.sort((a, b) => this.getCategorySortOrder(a.category) - this.getCategorySortOrder(b.category));
    }

    private getPromptsForCategory(categoryDisplay: string): PromptTreeItem[] {
        const category = this.getCategoryKey(categoryDisplay);
        const prompts = this.prompts.get(category) || [];
        
        return prompts
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(prompt => new PromptTreeItem(prompt, vscode.TreeItemCollapsibleState.None));
    }

    private getCategoryDisplayName(category: string): string {
        switch (category) {
            case 'chatmode': return 'Chatmode';
            case 'instructions': return 'Instructions';
            case 'prompts': return 'Prompts';
            default: return category;
        }
    }

    private getCategoryKey(displayName: string): string {
        switch (displayName.toLowerCase()) {
            case 'chatmode': return 'chatmode';
            case 'instructions': return 'instructions';
            case 'prompts': return 'prompts';
            default: return displayName.toLowerCase();
        }
    }

    private getCategorySortOrder(category: string): number {
        switch (category.toLowerCase()) {
            case 'chatmode': return 1;
            case 'prompts': return 2;
            case 'instructions': return 3;
            default: return 99;
        }
    }

    private async loadPrompts(): Promise<void> {
        if (this.isLoading) {
            this.logger.debug('loadPrompts already in progress, skipping');
            return;
        }
        
        this.isLoading = true;
        this.prompts.clear();
        this.logger.debug('Starting to load prompts - cleared existing prompts');
        
        try {
            const promptsDir = this.config.getPromptsDirectory();
            
            if (!await this.fileSystem.directoryExists(promptsDir)) {
                this.logger.debug(`Prompts directory does not exist: ${promptsDir}`);
                return;
            }

            // Load prompts from workspace (these are active/symlinked prompts)
            const workspaceFiles = await this.fileSystem.readDirectory(promptsDir);
            let workspaceCount = 0;
            
            for (const file of workspaceFiles) {
                // Skip the .promptitude directory and other hidden/system files
                if (file === '.promptitude' || file.startsWith('.')) {
                    continue;
                }
                
                if (this.isPromptFile(file)) {
                    const promptInfo = await this.createPromptInfo(promptsDir, file);
                    if (promptInfo) {
                        const category = promptInfo.type;
                        if (!this.prompts.has(category)) {
                            this.prompts.set(category, []);
                        }
                        this.prompts.get(category)!.push(promptInfo);
                        workspaceCount++;
                    }
                }
            }

            this.logger.debug(`Loaded ${workspaceCount} prompts from workspace`);

            // Load prompts from repository storage (these are all available prompts)
            await this.loadPromptsFromRepositoryStorage();

            this.logger.debug(`Total loaded: ${this.getTotalPromptCount()} prompts across ${this.prompts.size} categories`);
        } catch (error) {
            this.logger.error('Failed to load prompts', error instanceof Error ? error : undefined);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Load prompts from repository storage directories
     */
    private async loadPromptsFromRepositoryStorage(): Promise<void> {
        try {
            const promptsDir = this.config.getPromptsDirectory();
            // Store repositories in a sibling directory to prompts
            // This ensures profile-specific storage when using VS Code profiles
            const parentDir = path.dirname(promptsDir);
            const repoStorageDir = path.join(parentDir, 'repos');
            
            if (!await this.fileSystem.directoryExists(repoStorageDir)) {
                this.logger.debug('Repository storage directory does not exist');
                return;
            }

            const repoDirs = await this.fileSystem.readDirectory(repoStorageDir);
            let repoCount = 0;
            let addedCount = 0;
            let skippedCount = 0;
            
            for (const repoDir of repoDirs) {
                const fullRepoPath = path.join(repoStorageDir, repoDir);
                
                if (await this.fileSystem.directoryExists(fullRepoPath)) {
                    repoCount++;
                    const repoFiles = await this.fileSystem.readDirectory(fullRepoPath);
                    const repositoryUrl = this.decodeRepositoryUrl(repoDir);
                    
                    for (const file of repoFiles) {
                        if (this.isPromptFile(file)) {
                            // Check if this prompt is already loaded from workspace
                            const existingPrompt = this.findPromptByName(file);
                            
                            if (!existingPrompt) {
                                // Create prompt info for repository storage file
                                const promptInfo = await this.createRepositoryPromptInfo(fullRepoPath, file, repositoryUrl);
                                if (promptInfo) {
                                    const category = promptInfo.type;
                                    if (!this.prompts.has(category)) {
                                        this.prompts.set(category, []);
                                    }
                                    this.prompts.get(category)!.push(promptInfo);
                                    addedCount++;
                                }
                            } else {
                                // Update existing prompt with repository URL if it doesn't have one
                                if (!existingPrompt.repositoryUrl && repositoryUrl) {
                                    existingPrompt.repositoryUrl = repositoryUrl;
                                    this.logger.debug(`Updated repository URL for existing prompt: ${file}`);
                                }
                                skippedCount++;
                            }
                        }
                    }
                }
            }
            
            this.logger.debug(`Repository storage scan: ${repoCount} repos, ${addedCount} prompts added, ${skippedCount} duplicates skipped`);
        } catch (error) {
            this.logger.warn(`Failed to load prompts from repository storage: ${error}`);
        }
    }

    /**
     * Find a prompt by its filename across all categories
     */
    private findPromptByName(fileName: string): PromptInfo | undefined {
        for (const prompts of this.prompts.values()) {
            const found = prompts.find(p => p.name === fileName);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    /**
     * Create prompt info for a file in repository storage
     */
    private async createRepositoryPromptInfo(repoPath: string, fileName: string, repositoryUrl: string): Promise<PromptInfo | null> {
        try {
            const filePath = path.join(repoPath, fileName);
            const stats = await fs.promises.stat(filePath);
            const content = await this.fileSystem.readFileContent(filePath);
            
            // Determine type based on filename patterns
            const type = this.determinePromptType(fileName);
            
            // Extract description from content
            const description = this.extractDescription(content);
            
            // Create workspace path for checking active status
            const workspacePath = path.join(this.config.getPromptsDirectory(), fileName);
            
            const promptInfo: PromptInfo = {
                name: fileName,
                path: workspacePath, // Use workspace path for consistency
                type,
                size: stats.size,
                lastModified: stats.mtime,
                lineCount: content.split('\n').length,
                active: false, // Repository storage files are inactive by default
                repositoryUrl,
                description
            };

            return promptInfo;
        } catch (error) {
            this.logger.warn(`Failed to create repository prompt info for ${fileName}: ${error}`);
            return null;
        }
    }

    private isPromptFile(fileName: string): boolean {
        // Filter out directories, hidden files, and non-prompt files
        return !fileName.startsWith('.') && 
               !fileName.startsWith('_') && 
               (fileName.endsWith('.md') || fileName.endsWith('.txt'));
    }

    private async createPromptInfo(promptsDir: string, fileName: string): Promise<PromptInfo | null> {
        try {
            const filePath = path.join(promptsDir, fileName);
            const stats = await fs.promises.stat(filePath);
            const content = await this.fileSystem.readFileContent(filePath);
            
            // Determine type based on filename patterns
            const type = this.determinePromptType(fileName);
            
            // Extract description from content
            const description = this.extractDescription(content);
            
            // Check if this is a symlink and extract repository URL
            let repositoryUrl: string | undefined;
            let isSymlink = false;
            try {
                const linkStats = await fs.promises.lstat(filePath);
                if (linkStats.isSymbolicLink()) {
                    isSymlink = true;
                    const targetPath = await fs.promises.readlink(filePath);
                    repositoryUrl = this.extractRepositoryUrlFromPath(targetPath);
                }
            } catch (error) {
                // If lstat fails, it's likely not a symlink
                this.logger.debug(`Not a symlink or failed to check: ${fileName}`);
            }
            
            const promptInfo: PromptInfo = {
                name: fileName,
                path: filePath,
                type,
                size: stats.size,
                lastModified: stats.mtime,
                lineCount: content.split('\n').length,
                active: isSymlink, // Active state is based on whether it's a symlink
                repositoryUrl,
                description
            };

            // Keep the activePrompts Set in sync
            if (isSymlink) {
                this.activePrompts.add(filePath);
            }

            return promptInfo;
        } catch (error) {
            this.logger.warn(`Failed to create prompt info for ${fileName}: ${error}`);
            return null;
        }
    }

    private determinePromptType(fileName: string): 'chatmode' | 'instructions' | 'prompts' {
        const lowerName = fileName.toLowerCase();
        
        if (lowerName.includes('chatmode') || lowerName.includes('chat-mode')) {
            return 'chatmode';
        }
        
        if (lowerName.includes('instruction') || lowerName.includes('guide')) {
            return 'instructions';
        }
        
        return 'prompts';
    }

    /**
     * Extract description from YAML frontmatter or content
     */
    private extractDescription(content: string): string {
        // Try to parse YAML frontmatter
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            
            // Look for description field in frontmatter (handles both quoted and unquoted values)
            const descriptionMatch = frontmatter.match(/description:\s*['"]([^'"]+)['"]|description:\s*([^\n]+)/);
            if (descriptionMatch) {
                // Use captured group 1 if quoted, otherwise group 2 if unquoted
                const description = (descriptionMatch[1] || descriptionMatch[2] || '').trim();
                if (description) {
                    return description;
                }
            }
        }
        
        // Fallback: Try to get first meaningful line from content
        const lines = content
            .replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '') // Remove frontmatter
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#') && !line.startsWith('//') && !line.startsWith('/*'));
        
        if (lines.length > 0) {
            const firstLine = lines[0];
            return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
        }
        
        return 'No description available';
    }

    private getTotalPromptCount(): number {
        let count = 0;
        for (const prompts of this.prompts.values()) {
            count += prompts.length;
        }
        return count;
    }

    // Selection management methods
    toggleSelection(promptInfo: PromptInfo): void {
        if (promptInfo.active) {
            this.activePrompts.delete(promptInfo.path);
            promptInfo.active = false;
        } else {
            this.activePrompts.add(promptInfo.path);
            promptInfo.active = true;
        }
        this._onDidChangeTreeData.fire();
    }

    selectAll(): void {
        for (const prompts of this.prompts.values()) {
            for (const prompt of prompts) {
                this.activePrompts.add(prompt.path);
                prompt.active = true;
            }
        }
        this._onDidChangeTreeData.fire();
    }

    deselectAll(): void {
        this.activePrompts.clear();
        for (const prompts of this.prompts.values()) {
            for (const prompt of prompts) {
                prompt.active = false;
            }
        }
        this._onDidChangeTreeData.fire();
    }

    getSelectedPrompts(): PromptInfo[] {
        const active: PromptInfo[] = [];
        for (const prompts of this.prompts.values()) {
            active.push(...prompts.filter(p => p.active));
        }
        return active;
    }

    getPromptByPath(filePath: string): PromptInfo | undefined {
        for (const prompts of this.prompts.values()) {
            const found = prompts.find(p => p.path === filePath);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    getAllPrompts(): PromptInfo[] {
        const allPrompts: PromptInfo[] = [];
        for (const prompts of this.prompts.values()) {
            allPrompts.push(...prompts);
        }
        return allPrompts;
    }

    /**
     * Extract repository URL from a symlink target path
     * Expected format: .../prompts/.promptitude/repos/{repo_url_encoded}/filename
     */
    private extractRepositoryUrlFromPath(targetPath: string): string | undefined {
        try {
            // Split the path and look for the repos directory structure
            const pathParts = targetPath.split(path.sep);
            const reposIndex = pathParts.findIndex(part => part === 'repos');
            
            if (reposIndex !== -1 && reposIndex + 1 < pathParts.length) {
                const encodedRepoUrl = pathParts[reposIndex + 1];
                // Decode the repository URL
                return this.decodeRepositoryUrl(encodedRepoUrl);
            }
            
            return undefined;
        } catch (error) {
            this.logger.warn(`Failed to extract repository URL from path: ${targetPath}: ${error}`);
            return undefined;
        }
    }

    /**
     * Decode a repository URL from its encoded directory name
     * Supports both new base64url format and legacy underscore-based format
     */
    private decodeRepositoryUrl(encodedUrl: string): string {
        // Check if this is a legacy underscore-based slug
        if (isLegacySlug(encodedUrl)) {
            this.logger.debug(`Detected legacy slug format: ${encodedUrl}`);
            return legacySlugToUrl(encodedUrl);
        }
        
        // Use new base64url decoding
        try {
            return decodeRepositorySlug(encodedUrl);
        } catch (error) {
            // Fallback to legacy format if base64url decoding fails
            this.logger.warn(`Failed to decode as base64url, falling back to legacy format: ${encodedUrl}`);
            return legacySlugToUrl(encodedUrl);
        }
    }
}