import * as vscode from 'vscode';
import { GitApiManager, GitTree, RepositoryInfo } from './gitProvider';
import { Logger } from './logger';

interface PATCache {
    [organization: string]: number; // organization name -> PAT array index
}

export class AzureDevOpsApiManager implements GitApiManager {
    private static readonly patsStorageKey = 'promptitude.azureDevOps.pats';
    private static readonly cacheStorageKey = 'promptitude.azureDevOps.patCache';
    private static readonly minPatLength = 8; // Reduced from 20 to be more permissive
    private extensionContext: vscode.ExtensionContext;
    private logger: Logger;

    constructor(context: vscode.ExtensionContext, logger: Logger = Logger.get('AzureDevOpsApi')) {
        if (!context) {
            throw new Error('Extension context is required for Azure DevOps authentication');
        }
        this.extensionContext = context;
        this.logger = logger;
    }

    getProviderName(): string {
        return 'azure';
    }

    async getRepositoryTree(owner: string, repo: string, branch: string): Promise<GitTree> {
        // Parse the owner to extract organization and project
        const { organization, project, baseUrl } = this.parseOwnerInfo(owner);
        
        // Get auth headers for this specific organization
        const headers = await this.getAuthHeaders(organization);
        
        // Azure DevOps REST API endpoint for getting repository items
        // For visualstudio.com, the format is: baseUrl/project/_apis/git/repositories/repo/items
        // For dev.azure.com, the format is: baseUrl/org/project/_apis/git/repositories/repo/items
        let url: string;
        if (baseUrl.includes('visualstudio.com')) {
            // Legacy visualstudio.com format: baseUrl/project/_apis/...
            url = `${baseUrl}/${encodeURIComponent(project)}/_apis/git/repositories/${repo}/items?recursionLevel=Full&versionDescriptor.version=${branch}&versionDescriptor.versionType=branch&api-version=7.0`;
        } else {
            // Modern dev.azure.com format: baseUrl/org/project/_apis/...
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
                throw new Error('Azure DevOps Access forbidden. Please ensure your PAT has Code (read) permissions for this repository.');
            } else if (response.status === 404) {
                throw new Error('Azure DevOps Repository not found. Please check the PAT, repository URL and branch name are correct. Remember if no branch name is specified, main is used by default.');
            }
            throw new Error(`Azure DevOps Failed to get repository tree: ${response.status} ${response.statusText}`);
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
        // Parse the owner to extract organization and project
        const { organization, project, baseUrl } = this.parseOwnerInfo(owner);
        
        // Get auth headers for this specific organization
        const headers = await this.getAuthHeaders(organization);
        
        // Azure DevOps REST API endpoint for getting file content
        // For visualstudio.com, the format is: baseUrl/project/_apis/git/repositories/repo/items
        // For dev.azure.com, the format is: baseUrl/org/project/_apis/git/repositories/repo/items
        let url: string;
        if (baseUrl.includes('visualstudio.com')) {
            // Legacy visualstudio.com format: baseUrl/project/_apis/...
            url = `${baseUrl}/${encodeURIComponent(project)}/_apis/git/repositories/${repo}/items?path=${encodeURIComponent(path)}&versionDescriptor.version=${branch}&versionDescriptor.versionType=branch&api-version=7.0`;
        } else {
            // Modern dev.azure.com format: baseUrl/org/project/_apis/...
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
                throw new Error('Azure DevOps Access forbidden. Please ensure your PAT has Code (read) permissions for this file.');
            } else if (response.status === 404) {
                throw new Error(`Azure DevOps File not found: ${path}`);
            }
            throw new Error(`Azure DevOps Failed to get file content: ${response.status} ${response.statusText}`);
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
            { pattern: /https:\/\/([^\/]+)\.visualstudio\.com\/([^\/]+)\/_git\/([^\/\s]+)/, format: 'legacy-with-project' }
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
                    // This should never happen, but guard against future pattern additions
                    throw new Error(`Unsupported Azure DevOps URL format: ${format}`);
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
            const pats = await this.getAllPATs();
            return pats.length > 0;
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

            // Add the PAT to the list (validation will happen during actual sync)
            await this.addPAT(pat);
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await vscode.window.showErrorMessage(`Failed to authenticate with Azure DevOps: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Get authenticated headers for API requests
     * Tries cached PAT first, then iterates through all PATs until one works
     */
    private async getAuthHeaders(organization: string): Promise<{ [key: string]: string }> {
        const pats = await this.getAllPATs();
        
        if (pats.length === 0) {
            throw new Error('No Azure DevOps PAT configured. Please add a PAT first.');
        }

        // Try cached PAT first
        const cache = await this.getCache();
        const cachedIndex = cache[organization];
        
        if (cachedIndex !== undefined && cachedIndex < pats.length) {
            const headers = this.buildAuthHeaders(pats[cachedIndex]);
            
            if (await this.validateHeaders(headers, organization)) {
                this.logger.debug(`Cache hit: PAT validated for '${organization}'`);
                return headers;
            }
            
            // Cache was stale, remove this entry
            this.logger.debug(`Cache miss: cached PAT no longer valid for '${organization}'`);
            delete cache[organization];
            await this.saveCache(cache);
        }

        // Try all PATs
        this.logger.debug(`Trying all PATs (${pats.length} total) for organization '${organization}'`);
        for (let i = 0; i < pats.length; i++) {
            this.logger.debug(`Attempting PAT ${i + 1}/${pats.length} for organization '${organization}'`);
            const headers = this.buildAuthHeaders(pats[i]);
            
            if (await this.validateHeaders(headers, organization)) {
                this.logger.debug(`Success: a PAT successfully validated for '${organization}', updating cache`);
                // Cache successful PAT
                cache[organization] = i;
                await this.saveCache(cache);
                return headers;
            }
        }

        throw new Error(`No valid PAT found for Azure DevOps organization '${organization}'. Please add a PAT with access to this organization.`);
    }

    /**
     * Build authorization headers from a PAT
     */
    private buildAuthHeaders(pat: string): { [key: string]: string } {
        return {
            ['Authorization']: `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
            ['Accept']: 'application/json',
            ['Content-Type']: 'application/json',
            ['User-Agent']: 'VS Code Promptitude Extension'
        };
    }

    /**
     * Validate headers by making a test API call to the organization
     * Note: We can't validate without a specific repository since PATs only have Code:Read permission
     * This method will be called naturally during repository operations
     */
    private async validateHeaders(headers: { [key: string]: string }, organization: string): Promise<boolean> {
        try {
            // Try to list projects in the organization - this requires minimal permissions
            // For dev.azure.com format
            const url = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis/projects?api-version=7.0`;
            const response = await fetch(url, { headers });
            
            if (response.ok) {
                return true;
            }
            
            // If dev.azure.com fails, try legacy visualstudio.com format
            const legacyUrl = `https://${encodeURIComponent(organization)}.visualstudio.com/_apis/projects?api-version=7.0`;
            const legacyResponse = await fetch(legacyUrl, { headers });
            
            return legacyResponse.ok;
        } catch (error) {
            this.logger.debug(`Validation failed for organization '${organization}': ${error}`);
            return false;
        }
    }



    /**
     * Get all stored PATs
     */
    private async getAllPATs(): Promise<string[]> {
        const stored = await this.extensionContext.secrets.get(AzureDevOpsApiManager.patsStorageKey);
        if (!stored) {
            return [];
        }
        try {
            const pats = JSON.parse(stored);
            return Array.isArray(pats) ? pats : [];
        } catch {
            return [];
        }
    }

    /**
     * Add a new PAT to the list
     */
    async addPAT(pat: string): Promise<void> {
        const pats = await this.getAllPATs();
        if (!pats.includes(pat)) {
            pats.push(pat);
            await this.extensionContext.secrets.store(
                AzureDevOpsApiManager.patsStorageKey,
                JSON.stringify(pats)
            );
        }
    }

    /**
     * Remove a PAT from the list by index
     */
    async removePAT(index: number): Promise<void> {
        const pats = await this.getAllPATs();
        if (index >= 0 && index < pats.length) {
            pats.splice(index, 1);
            await this.extensionContext.secrets.store(
                AzureDevOpsApiManager.patsStorageKey,
                JSON.stringify(pats)
            );
            // Clear cache since PAT indices have changed
            await this.clearCache();
        }
    }

    /**
     * Remove all PATs
     */
    async clearAllPATs(): Promise<void> {
        await this.extensionContext.secrets.delete(AzureDevOpsApiManager.patsStorageKey);
        await this.clearCache();
    }

    /**
     * Get the PAT cache
     */
    private async getCache(): Promise<PATCache> {
        const stored = this.extensionContext.globalState.get<string>(AzureDevOpsApiManager.cacheStorageKey);
        if (!stored) {
            return {};
        }
        try {
            return JSON.parse(stored);
        } catch {
            return {};
        }
    }

    /**
     * Save the PAT cache
     */
    private async saveCache(cache: PATCache): Promise<void> {
        await this.extensionContext.globalState.update(
            AzureDevOpsApiManager.cacheStorageKey,
            JSON.stringify(cache)
        );
    }

    /**
     * Clear the PAT cache
     */
    async clearCache(): Promise<void> {
        await this.extensionContext.globalState.update(AzureDevOpsApiManager.cacheStorageKey, undefined);
    }

    /**
     * Get count of stored PATs
     */
    async getPATCount(): Promise<number> {
        const pats = await this.getAllPATs();
        return pats.length;
    }

    /**
     * Get list of cached organizations
     */
    async getCachedOrganizations(): Promise<string[]> {
        const cache = await this.getCache();
        return Object.keys(cache);
    }
}