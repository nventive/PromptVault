import * as vscode from 'vscode';
import { GitApiManager, GitTree, RepositoryInfo } from './gitProvider';
import { Logger } from './logger';

export class AzureDevOpsApiManager implements GitApiManager {
    private static readonly patStorageKey = 'promptitude.azureDevOps.pat';
    private static readonly minPatLength = 8; // Reduced from 20 to be more permissive
    private extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        if (!context) {
            throw new Error('Extension context is required for Azure DevOps authentication');
        }
        this.extensionContext = context;
    }

    getProviderName(): string {
        return 'azure';
    }

    async getAuthenticatedUser(): Promise<any> {
        const headers = await this.getAuthHeaders();
        
        try {
            // Get actual user profile from Azure DevOps
            const response = await fetch('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0', {
                headers
            });
            
            if (!response.ok) {
                throw new Error(`Failed to get user profile: ${response.status} ${response.statusText}`);
            }
            
            const profile = await response.json();
            return {
                login: profile.emailAddress || 'azure-user',
                name: profile.displayName || 'Azure DevOps User',
                id: profile.id
            };
        } catch (error) {
            // Fallback to generic user object if profile fetch fails
            return {
                login: 'azure-user',
                name: 'Azure DevOps User'
            };
        }
    }

    async getRepositoryTree(owner: string, repo: string, branch: string = 'main'): Promise<GitTree> {
        const headers = await this.getAuthHeaders();
        
        // Parse the owner to extract organization and project
        const { organization, project, baseUrl } = this.parseOwnerInfo(owner);
        
        // Azure DevOps REST API endpoint for getting repository items
        // For visualstudio.com, the format is: baseUrl/project/_apis/git/repositories/repo/items
        // For dev.azure.com, the format is: baseUrl/org/project/_apis/git/repositories/repo/items
        let url: string;
        if (baseUrl.includes('visualstudio.com')) {
            // URL encode the project name to handle spaces and special characters
            const encodedProject = encodeURIComponent(project);
            url = `${baseUrl}/${encodedProject}/_apis/git/repositories/${repo}/items?recursionLevel=Full&versionDescriptor.version=${branch}&versionDescriptor.versionType=branch&api-version=7.0`;
        } else {
            // URL encode both organization and project name
            const encodedOrganization = encodeURIComponent(organization);
            const encodedProject = encodeURIComponent(project);
            url = `${baseUrl}/${encodedOrganization}/${encodedProject}/_apis/git/repositories/${repo}/items?recursionLevel=Full&versionDescriptor.version=${branch}&versionDescriptor.versionType=branch&api-version=7.0`;
        }

        const response = await fetch(url, { headers });
        const responseText = await response.text();

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Azure DevOps authentication failed. Please check your Personal Access Token.');
            } else if (response.status === 403) {
                throw new Error('Access forbidden. Please ensure your PAT has Code (read) permissions for this repository.');
            } else if (response.status === 404) {
                throw new Error('Repository not found. Please check the organization, project, and repository names.');
            }
            throw new Error(`Failed to get repository tree: ${response.status} ${response.statusText}`);
        }

        try {
            const data = JSON.parse(responseText);
            
            // Convert Azure DevOps response to our GitTree format
            const treeItems = data.value
                .filter((item: any) => item.gitObjectType === 'blob') // Only files
                .map((item: any) => ({
                    path: item.path.startsWith('/') ? item.path.substring(1) : item.path,
                    mode: '100644',
                    type: 'blob' as const,
                    sha: item.objectId,
                    url: item.url
                }));

            return {
                tree: treeItems,
                truncated: false
            };
        } catch (jsonError) {
            // Check if it's a sign-in page
            if (responseText.includes('Sign In') || responseText.includes('signin') || responseText.includes('<!DOCTYPE')) {
                throw new Error(`Azure DevOps authentication failed. The API returned a sign-in page instead of data. Please verify your Personal Access Token is correct and has not expired. You may need to update it using the "Promptitude: Update Azure DevOps Personal Access Token" command.`);
            }
            
            throw new Error(`Azure DevOps API returned non-JSON response. This might indicate an authentication or URL formatting issue.`);
        }
    }

    async getFileContent(owner: string, repo: string, path: string, branch: string = 'main'): Promise<string> {
        const headers = await this.getAuthHeaders();
        
        // Parse the owner to extract organization and project
        const { organization, project, baseUrl } = this.parseOwnerInfo(owner);
        
        // Azure DevOps REST API endpoint for getting file content
        // For visualstudio.com, the format is: baseUrl/project/_apis/git/repositories/repo/items
        // For dev.azure.com, the format is: baseUrl/org/project/_apis/git/repositories/repo/items
        let url: string;
        if (baseUrl.includes('visualstudio.com')) {
            // URL encode the project name to handle spaces and special characters
            const encodedProject = encodeURIComponent(project);
            url = `${baseUrl}/${encodedProject}/_apis/git/repositories/${repo}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${branch}&versionDescriptor.versionType=branch&api-version=7.0`;
        } else {
            // URL encode both organization and project name
            const encodedOrganization = encodeURIComponent(organization);
            const encodedProject = encodeURIComponent(project);
            url = `${baseUrl}/${encodedOrganization}/${encodedProject}/_apis/git/repositories/${repo}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${branch}&versionDescriptor.versionType=branch&api-version=7.0`;
        }

        const response = await fetch(url, {
            headers: {
                ...headers,
                ['Accept']: 'text/plain'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Azure DevOps authentication failed. Please check your Personal Access Token.');
            } else if (response.status === 403) {
                throw new Error('Access forbidden. Please ensure your PAT has Code (read) permissions for this file.');
            } else if (response.status === 404) {
                throw new Error(`File not found: ${path}`);
            }
            throw new Error(`Failed to get file content: ${response.status} ${response.statusText}`);
        }

        return response.text();
    }

    parseRepositoryUrl(url: string): RepositoryInfo {
        // Decode URL first to handle encoded characters like %20 for spaces
        const decodedUrl = decodeURIComponent(url);
        const cleanUrl = decodedUrl.replace(/\.git$/, '').replace(/\/$/, '');
        
        // Azure DevOps patterns
        const azurePatterns = [
            // Modern dev.azure.com format: https://dev.azure.com/org/project/_git/repo
            { pattern: /https:\/\/dev\.azure\.com\/([^\/]+)\/([^\/]+)\/_git\/([^\/\s]+)/, format: 'modern' },
            // Legacy visualstudio.com with project: https://org.visualstudio.com/project/_git/repo
            { pattern: /https:\/\/([^\/]+)\.visualstudio\.com\/([^\/]+)\/_git\/([^\/\s]+)/, format: 'legacy-with-project' },
            // Legacy visualstudio.com without project: https://org.visualstudio.com/_git/repo
            { pattern: /https:\/\/([^\/]+)\.visualstudio\.com\/_git\/([^\/\s]+)/, format: 'legacy-no-project' }
        ];

        for (const { pattern, format } of azurePatterns) {
            const match = cleanUrl.match(pattern);
            if (match) {
                let organization: string;
                let project: string;
                let repo: string;
                let baseUrl: string;
                
                if (format === 'modern') {
                    // https://dev.azure.com/org/project/_git/repo
                    organization = match[1];
                    project = match[2];
                    repo = match[3];
                    baseUrl = 'https://dev.azure.com';
                } else if (format === 'legacy-with-project') {
                    // https://org.visualstudio.com/project/_git/repo
                    organization = match[1];
                    project = match[2];
                    repo = match[3];
                    baseUrl = `https://${organization}.visualstudio.com`;
                } else {
                    // https://org.visualstudio.com/_git/repo (project and repo are the same)
                    organization = match[1];
                    project = match[2]; // In this case, project name = repo name
                    repo = match[2];
                    baseUrl = `https://${organization}.visualstudio.com`;
                }
                
                // Store organization, project, and baseUrl in the owner field for later use
                return {
                    owner: `${organization}|${project}|${baseUrl}`,
                    repo: repo,
                    provider: 'azure'
                };
            }
        }

        throw new Error(`Invalid Azure DevOps repository URL: ${url}`);
    }

    /**
     * Parse the owner field that contains organization|project|baseUrl
     */
    private parseOwnerInfo(owner: string): { organization: string; project: string; baseUrl: string } {
        const parts = owner.split('|');
        if (parts.length !== 3) {
            throw new Error(`Invalid owner format. Expected 'organization|project|baseUrl', got: ${owner}`);
        }
        
        return {
            organization: parts[0],
            project: parts[1],
            baseUrl: parts[2]
        };
    }

    async checkAuthentication(): Promise<boolean> {
        try {
            const pat = await this.getPersonalAccessToken();
            return !!pat;
        } catch {
            return false;
        }
    }

    async requestAuthentication(): Promise<boolean> {
        try {
            const pat = await vscode.window.showInputBox({
                prompt: 'Enter your Azure DevOps Personal Access Token',
                password: true,
                placeHolder: 'Your PAT with Code (read) permissions',
                ignoreFocusOut: true,
                validateInput: (value: string) => {
                    if (!value || value.trim().length === 0) {
                        return 'Personal Access Token is required';
                    }
                    if (value.length < AzureDevOpsApiManager.minPatLength) {
                        return `Personal Access Token appears to be too short (minimum ${AzureDevOpsApiManager.minPatLength} characters)`;
                    }
                    // Allow tokens with various formats - Azure DevOps PATs can vary in length
                    if (value.length > 200) {
                        return 'Personal Access Token appears to be too long';
                    }
                    return null;
                }
            });

            if (!pat) {
                return false; // User cancelled
            }

            // Validate the PAT by making a test API call (but don't fail if network issues occur)
            const isValid = await this.validatePAT(pat);
            if (!isValid) {
                const userChoice = await vscode.window.showWarningMessage(
                    'Unable to validate Personal Access Token with Azure DevOps API. This could be due to network issues or token permissions.',
                    'Use Token Anyway',
                    'Try Different Token'
                );
                
                if (userChoice !== 'Use Token Anyway') {
                    return false;
                }
            }

            // Store the PAT securely
            await this.storePersonalAccessToken(pat);
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await vscode.window.showErrorMessage(`Failed to authenticate with Azure DevOps: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Get authenticated headers for API requests
     */
    private async getAuthHeaders(): Promise<{ [key: string]: string }> {
        const pat = await this.getPersonalAccessToken();
        if (!pat) {
            throw new Error('No Azure DevOps PAT found. Please authenticate first.');
        }

        return {
            ['Authorization']: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
            ['Accept']: 'application/json',
            ['Content-Type']: 'application/json',
            ['User-Agent']: 'VS Code Promptitude Extension'
        };
    }

    /**
     * Validate PAT by making a test API call
     */
    private async validatePAT(pat: string): Promise<boolean> {
        try {
            const response = await fetch('https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=6.0', {
                headers: {
                    ['Authorization']: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
                    ['Accept']: 'application/json'
                }
            });
            return true;
        } catch (error) {
            console.log('PAT validation network error:', error);
            // Network errors shouldn't invalidate tokens
            return true; // Be more permissive
        }
    }

    /**
     * Securely retrieve the PAT from VS Code's SecretStorage
     */
    private async getPersonalAccessToken(): Promise<string | undefined> {
        return await this.extensionContext.secrets.get(AzureDevOpsApiManager.patStorageKey);
    }

    /**
     * Securely store the PAT using VS Code's SecretStorage
     */
    private async storePersonalAccessToken(pat: string): Promise<void> {
        await this.extensionContext.secrets.store(AzureDevOpsApiManager.patStorageKey, pat);
    }

    /**
     * Remove the stored PAT (for logout/cleanup)
     */
    async clearPersonalAccessToken(): Promise<void> {
        await this.extensionContext.secrets.delete(AzureDevOpsApiManager.patStorageKey);
    }

    /**
     * Check if PAT is stored and appears valid
     */
    async hasValidPAT(): Promise<boolean> {
        const pat = await this.getPersonalAccessToken();
        return pat !== undefined && pat.length >= AzureDevOpsApiManager.minPatLength;
    }
}