import * as vscode from 'vscode';
import { GitApiManager, GitProvider } from './gitProvider';
import { GitHubApiManager } from './github';
import { AzureDevOpsApiManager } from './azureDevOps';

export class GitProviderFactory {
    /**
     * Auto-detect the Git provider from a repository URL and return the appropriate API manager
     */
    static createFromUrl(url: string, context?: vscode.ExtensionContext): GitApiManager {
        const provider = GitProviderFactory.detectProvider(url);
        
        switch (provider) {
            case 'github':
                return new GitHubApiManager();
            case 'azure':
                if (!context) {
                    throw new Error('Extension context is required for Azure DevOps authentication');
                }
                return new AzureDevOpsApiManager(context);
            case 'gitlab':
                // TODO: Implement GitLabApiManager when needed
                throw new Error('GitLab support is not implemented yet');
            case 'bitbucket':
                // TODO: Implement BitbucketApiManager when needed
                throw new Error('Bitbucket support is not implemented yet');
            default:
                throw new Error(`Unsupported Git provider for URL: ${url}`);
        }
    }

    /**
     * Detect the Git provider from a repository URL
     */
    static detectProvider(url: string): GitProvider {
        const cleanUrl = url.replace(/\.git$/, '').replace(/\/$/, '');
        
        // GitHub patterns
        if (/github\.com/.test(cleanUrl)) {
            return 'github';
        }
        
        // Azure DevOps patterns
        if (/dev\.azure\.com/.test(cleanUrl) || /\.visualstudio\.com/.test(cleanUrl)) {
            return 'azure';
        }
        
        // GitLab patterns
        if (/gitlab\.com/.test(cleanUrl) || /gitlab\./.test(cleanUrl)) {
            return 'gitlab';
        }
        
        // Bitbucket patterns
        if (/bitbucket\.org/.test(cleanUrl)) {
            return 'bitbucket';
        }
        
        return 'unknown';
    }

    /**
     * Get all supported providers
     */
    static getSupportedProviders(): GitProvider[] {
        return ['github', 'azure'];
    }

    /**
     * Check if a provider is supported
     */
    static isProviderSupported(provider: GitProvider): boolean {
        return GitProviderFactory.getSupportedProviders().includes(provider);
    }
}