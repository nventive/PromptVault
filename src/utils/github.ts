import * as vscode from 'vscode';
import { GitApiManager, GitTree, RepositoryInfo } from './gitProvider';

export class GitHubApiManager implements GitApiManager {
    private baseUrl = 'https://api.github.com';

    getProviderName(): string {
        return 'github';
    }

    async getRepositoryTree(owner: string, repo: string, branch: string = 'master'): Promise<GitTree> {
        const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: false });
        if (!session) {
            throw new Error('GitHub authentication required');
        }

        // First get the commit SHA for the branch
        const branchResponse = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/branches/${branch}`, {
            headers: {
                ['Authorization']: `Bearer ${session.accessToken}`,
                ['Accept']: 'application/vnd.github.v3+json',
                ['User-Agent']: 'VS Code Promptitude Extension'
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
                ['Authorization']: `Bearer ${session.accessToken}`,
                ['Accept']: 'application/vnd.github.v3+json',
                ['User-Agent']: 'VS Code Promptitude Extension'
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
        console.log(`Fetching file content from ${owner}/${repo}/${path} on branch ${branch}`);
        const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
            headers: {
                ['Authorization']: `Bearer ${session.accessToken}`,
                ['Accept']: 'application/vnd.github.v3+json',
                ['User-Agent']: 'VS Code Promptitude Extension'
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

    parseRepositoryUrl(url: string): RepositoryInfo {
        // Parse GitHub URLs only
        const cleanUrl = url.replace(/\.git$/, '').replace(/\/$/, '');
        
        // GitHub patterns
        const githubPatterns = [
            /github\.com[\/:]([^\/]+)\/([^\/\s]+)/,
            /github\.com\/([^\/]+)\/([^\/\s]+)/
        ];

        // Try GitHub patterns
        for (const pattern of githubPatterns) {
            const match = cleanUrl.match(pattern);
            if (match) {
                return {
                    owner: match[1],
                    repo: match[2],
                    provider: 'github'
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
