import * as vscode from 'vscode';

export interface GitHubFile {
    name: string;
    path: string;
    content?: string;
    download_url?: string;
    type: 'file' | 'dir';
}

export interface GitHubTreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    url: string;
}

export interface GitHubTree {
    tree: GitHubTreeItem[];
    truncated: boolean;
}

export class GitHubApiManager {
    private baseUrl = 'https://api.github.com';

    async getAuthenticatedUser(): Promise<any> {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
        if (!session) {
            throw new Error('GitHub authentication required');
        }

        const response = await fetch(`${this.baseUrl}/user`, {
            headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VS Code Prompts Sync Extension'
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    async getRepositoryTree(owner: string, repo: string, branch: string = 'master'): Promise<GitHubTree> {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
        if (!session) {
            throw new Error('GitHub authentication required');
        }

        // First get the commit SHA for the branch
        const branchResponse = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/branches/${branch}`, {
            headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VS Code Prompts Sync Extension'
            }
        });

        if (!branchResponse.ok) {
            throw new Error(`Failed to get branch info: ${branchResponse.status} ${branchResponse.statusText}`);
        }

        const branchData = await branchResponse.json();
        const commitSha = branchData.commit.sha;

        // Get the tree recursively
        const treeResponse = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`, {
            headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VS Code Prompts Sync Extension'
            }
        });

        if (!treeResponse.ok) {
            throw new Error(`Failed to get repository tree: ${treeResponse.status} ${treeResponse.statusText}`);
        }

        return treeResponse.json();
    }

    async getFileContent(owner: string, repo: string, path: string, branch: string = 'master'): Promise<string> {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
        if (!session) {
            throw new Error('GitHub authentication required');
        }

        const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
            headers: {
                'Authorization': `Bearer ${session.accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VS Code Prompts Sync Extension'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get file content: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.content) {
            // Content is base64 encoded
            return Buffer.from(data.content, 'base64').toString('utf8');
        }

        throw new Error('No content found in file');
    }

    parseRepositoryUrl(url: string): { owner: string; repo: string } {
        // Handle different GitHub URL formats
        const patterns = [
            /github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?$/,
            /github\.com\/([^\/]+)\/([^\/]+)\/$/,
            /github\.com\/([^\/]+)\/([^\/]+)$/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return {
                    owner: match[1],
                    repo: match[2].replace(/\.git$/, '')
                };
            }
        }

        throw new Error(`Invalid GitHub repository URL: ${url}`);
    }

    async checkAuthentication(): Promise<boolean> {
        try {
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
            return !!session;
        } catch {
            return false;
        }
    }

    async requestAuthentication(): Promise<boolean> {
        try {
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
            return !!session;
        } catch {
            return false;
        }
    }
}
