import * as vscode from 'vscode';

export interface GitFile {
    name: string;
    path: string;
    content?: string;
    downloadUrl?: string;
    type: 'file' | 'dir';
}

export interface GitTreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    url: string;
}

export interface GitTree {
    tree: GitTreeItem[];
    truncated: boolean;
}

export interface RepositoryInfo {
    owner: string;
    repo: string;
    provider: string;
}

export interface GitApiManager {
    /**
     * Get authenticated user information
     */
    getAuthenticatedUser(): Promise<any>;

    /**
     * Get repository tree for a specific branch
     */
    getRepositoryTree(owner: string, repo: string, branch: string): Promise<GitTree>;

    /**
     * Get content of a specific file
     */
    getFileContent(owner: string, repo: string, path: string, branch: string): Promise<string>;

    /**
     * Parse repository URL and extract owner, repo, and provider info
     */
    parseRepositoryUrl(url: string): RepositoryInfo;

    /**
     * Check if user is authenticated
     */
    checkAuthentication(): Promise<boolean>;

    /**
     * Request authentication from user
     */
    requestAuthentication(): Promise<boolean>;

    /**
     * Get the provider name (e.g., 'github', 'azure', 'gitlab')
     */
    getProviderName(): string;
}

export type GitProvider = 'github' | 'azure' | 'gitlab' | 'bitbucket' | 'unknown';