import * as vscode from 'vscode';
import { GitProviderFactory } from './utils/gitProviderFactory';
import { GitProvider } from './utils/gitProvider';
import { Logger } from './utils/logger';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as process from 'process';

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

    private readonly extensionContext: vscode.ExtensionContext;
    private readonly logger: Logger = Logger.get('ConfigManager');

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
    }

    get enabled(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('enabled', true);
    }

    get frequency(): keyof SyncFrequency {
        return vscode.workspace.getConfiguration('promptitude').get('frequency', 'daily');
    }

    get customPath(): string {
        return vscode.workspace.getConfiguration('promptitude').get('customPath', '');
    }

    get repositories(): string[] {
        const repository = vscode.workspace.getConfiguration('promptitude').get<string[]>('repositories', []);
        const sanitized = repository
            .map(r => (r ?? '').trim())
            .filter(r => r.length > 0);
        const uniqueArray = Array.from(new Set(sanitized));
        if (uniqueArray.length !== repository.length) {
            vscode.window.showWarningMessage('Duplicate repository URLs found in configuration. Duplicates have been removed.');
        }
        return uniqueArray;
    }

    /**
     * Returns repositories with their associated branch. The repositories setting accepts
     * entries in the form "https://github.com/owner/repo", "https://dev.azure.com/org/project/_git/repo", or with branch "repo_url|branch".
     * If no branch is specified, defaults to "main".
     */
    get repositoryConfigs(): { url: string; branch: string }[] {
        return this.repositories.map(entry => {
            const [url, branch] = entry.split('|');
            return { url, branch: (branch && branch.trim()) ? branch.trim() : 'main' };
        });
    }

    get syncOnStartup(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncOnStartup', true);
    }

    get showNotifications(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('showNotifications', true);
    }

    get debug(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('debug', false);
    }

    get syncChatmode(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncChatmode', true);
    }

    get syncInstructions(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncInstructions', false);
    }

    get syncPrompt(): boolean {
        return vscode.workspace.getConfiguration('promptitude').get('syncPrompt', true);
    }

    getSyncInterval(): number {
        return ConfigManager.SYNC_FREQUENCIES[this.frequency];
    }

    getPromptsDirectory(): string {
        if (this.customPath) {
            this.logger.info(`Using custom prompts path: ${this.customPath}`);
            return this.customPath;
        }

        this.logger.info('Using profile-aware path detection');
        return this.getProfileAwarePromptsDirectory();
    }

    /**
     * Get profile-aware prompts directory using multiple detection methods
     */
    private getProfileAwarePromptsDirectory(): string {
        this.logger.info('Attempting profile-aware path detection...');

        // Method 1: Detect profile from storage.json, process args, or file system (MOST RELIABLE)
        // This method includes storage.json parsing as primary, with fallbacks
        const detectedProfilePath = this.detectProfileFromEnvironment();
        if (detectedProfilePath) {
            if (this.debug) {
                this.logger.debug(`✅ Profile-specific path detected: ${detectedProfilePath}`);
            }
            return path.join(detectedProfilePath, 'prompts');
        }

    this.logger.info('No profile detected, checking Extension API paths...');

        // Method 2: Try storageUri (workspace-specific, might be profile-aware in some VS Code versions)
        const storageUri = this.extensionContext.storageUri;
        if (storageUri) {
            if (this.debug) {
                this.logger.debug(`Checking storageUri: ${storageUri.fsPath}`);
            }
            const profilePath = this.extractUserDirectoryFromStoragePath(storageUri.fsPath, 'workspaceStorage');
            if (profilePath && this.hasProfileInPath(profilePath)) {
                if (this.debug) {
                    this.logger.debug(`✅ Profile detected via storageUri: ${profilePath}`);
                }
                return path.join(profilePath, 'prompts');
            }
        }

        // Method 3: Use globalStorageUri as ultimate fallback (always works, but not profile-aware)
        const globalStorageUri = this.extensionContext.globalStorageUri;
        if (this.debug) {
            this.logger.debug(`Using globalStorageUri fallback: ${globalStorageUri.fsPath}`);
        }

        const globalProfilePath = this.extractUserDirectoryFromStoragePath(globalStorageUri.fsPath, 'globalStorage');
        if (globalProfilePath) {
            if (this.debug) {
                this.logger.debug(`Using default User directory: ${globalProfilePath}`);
            }
            return path.join(globalProfilePath, 'prompts');
        }

        // Final fallback to hardcoded paths (should rarely be needed)
        this.logger.warn('⚠️ All detection methods failed, using hardcoded fallback paths');
        return this.getFallbackPromptsDirectory();
    }

    /**
     * Extract User directory path from storage path
     */
    private extractUserDirectoryFromStoragePath(storagePath: string, storageType: string): string | null {
        const pathSegments = storagePath.split(/[/\\]/);
        const userIndex = pathSegments.findIndex((segment: string) => segment === 'User');

        if (userIndex === -1) {
            this.logger.debug(`Could not find 'User' directory in ${storageType} path: ${pathSegments.join(', ')}`);
            return null;
        }

        const storageIndex = pathSegments.findIndex((segment: string) => segment === storageType);
        if (storageIndex === -1) {
            this.logger.debug(`Could not find '${storageType}' directory in path: ${pathSegments.join(', ')}`);
            return null;
        }

        // Take all segments up to (but not including) the storage directory
        const userDirectorySegments = pathSegments.slice(0, storageIndex);
        return userDirectorySegments.join('/');
    }

    /**
     * Check if the path contains profile-specific segments
     */
    private hasProfileInPath(path: string): boolean {
        return path.includes('/profiles/') || path.includes('\\profiles\\');
    }

    /**
     * Check if storage.json exists and is readable
     */
    private storageJsonExists(): boolean {
        try {
            let storageJsonPath: string;
            switch (process.platform) {
                case 'win32':
                    storageJsonPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'storage.json');
                    break;
                case 'darwin':
                    storageJsonPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'storage.json');
                    break;
                case 'linux':
                    storageJsonPath = path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'storage.json');
                    break;
                default:
                    return false;
            }

            return fs.existsSync(storageJsonPath);
        } catch {
            return false;
        }
    }

    /**
     * Detect active profile by reading VS Code's storage.json file
     * This is the most reliable method as it reads the actual VS Code state
     * Returns: profile path if named profile is active, null if default profile is active or error occurred
     */
    private detectProfileFromStorageJson(): string | null {
        try {
            // Get the storage.json path based on platform
            let storageJsonPath: string;
            switch (process.platform) {
                case 'win32':
                    storageJsonPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'storage.json');
                    break;
                case 'darwin':
                    storageJsonPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'storage.json');
                    break;
                case 'linux':
                    storageJsonPath = path.join(os.homedir(), '.config', 'Code', 'User', 'globalStorage', 'storage.json');
                    break;
                default:
                    this.logger.debug(`Unsupported platform for storage.json detection: ${process.platform}`);
                    return null;
            }

            if (this.debug) {
                this.logger.debug(`Checking storage.json at: ${storageJsonPath}`);
            }

            if (!fs.existsSync(storageJsonPath)) {
                if (this.debug) {
                    this.logger.debug(`storage.json not found at: ${storageJsonPath}`);
                }
                return null;
            }

            // Read and parse storage.json
            const storageContent = fs.readFileSync(storageJsonPath, 'utf8');
            const storage = JSON.parse(storageContent);

            this.logger.debug('Successfully parsed storage.json');

            // Navigate to lastKnownMenubarData.menus.Preferences.items
            if (!storage.lastKnownMenubarData?.menus?.Preferences?.items) {
                this.logger.debug('Could not find lastKnownMenubarData.menus.Preferences.items in storage.json');
                return null;
            }

            const preferencesItems = storage.lastKnownMenubarData.menus.Preferences.items;
            this.logger.debug(`Found ${preferencesItems.length} items in Preferences menu`);

            // Find the Profiles submenu item
            const profilesMenuItem = preferencesItems.find((item: any) => item.id === 'submenuitem.Profiles');

            if (!profilesMenuItem) {
                this.logger.debug('Could not find \'submenuitem.Profiles\' in Preferences items');
                this.logger.debug(`Available menu items: ${preferencesItems.map((i: any) => i.id).join(', ')}`);
                return null;
            }

            this.logger.debug('Found Profiles submenu, checking for active profile...');

            // Find the checked profile in the submenu
            const submenuItems = profilesMenuItem.submenu?.items || [];
            const activeProfile = submenuItems.find((item: any) =>
                item.checked === true && item.id?.startsWith('workbench.profiles.actions.profileEntry.')
            );

            if (!activeProfile) {
                this.logger.debug('No active profile found (using default profile)');
                return null; // Default profile is active
            }

            // Extract profile ID from the item ID
            // Format: workbench.profiles.actions.profileEntry.{profileId}
            const profileId = activeProfile.id.replace('workbench.profiles.actions.profileEntry.', '');

            if (this.debug) {
                this.logger.debug(`Active profile ID: ${profileId}`);
                this.logger.debug(`Active profile label: ${activeProfile.label}`);
            }

            // Check for default profile
            if (profileId === '__default__profile__') {
                this.logger.debug('Default profile is active, no profile-specific path needed');
                return null;
            }

            // Construct the profile-specific path
            const baseUserPath = this.getBaseUserPath();
            const profilePath = path.join(baseUserPath, 'profiles', profileId);

            // Verify the profile directory exists
            if (fs.existsSync(profilePath)) {
                if (this.debug) {
                    this.logger.debug(`✅ Verified profile directory exists: ${profilePath}`);
                }
                return profilePath;
            } else {
                if (this.debug) {
                    this.logger.debug(`⚠️ Profile directory does not exist: ${profilePath}`);
                    this.logger.debug('Profile may use a different naming convention');
                }

                // Try with the label instead of ID as fallback
                const profilePathByLabel = path.join(baseUserPath, 'profiles', activeProfile.label);
                if (fs.existsSync(profilePathByLabel)) {
                    if (this.debug) {
                        this.logger.debug(`✅ Found profile by label: ${profilePathByLabel}`);
                    }
                    return profilePathByLabel;
                }

                return null;
            }
        } catch (error) {
            this.logger.error(`Error reading storage.json: ${error}`);
            if (this.debug && error instanceof Error && error.stack) {
                this.logger.debug(`Error stack: ${error.stack}`);
            }
            return null;
        }
    }

    /**
     * Try to detect profile from VS Code storage.json (most reliable method)
     */
    private detectProfileFromEnvironment(): string | null {
        try {
            this.logger.debug('Attempting profile detection from VS Code storage...');
            this.logger.debug(`Process platform: ${process.platform}`);

            // Method 1: Read storage.json to find active profile (MOST RELIABLE)
            const storageJsonResult = this.detectProfileFromStorageJson();

            // Check if storage.json was successfully read
            const storageJsonExists = this.storageJsonExists();

            if (storageJsonExists) {
                // storage.json exists and was parsed successfully
                if (storageJsonResult) {
                    // Named profile is active
                    this.logger.info(`✅ Named profile detected from storage.json: ${storageJsonResult}`);
                    return storageJsonResult;
                } else {
                    // Default profile is active (null is intentional)
                    this.logger.info('✅ Default profile is active (from storage.json)');
                    return null; // This will use the default User/prompts path
                }
            } else {
                // storage.json doesn't exist or failed to parse, try fallback methods
                this.logger.debug('storage.json not available, trying alternative methods...');
            }

            // Log all process arguments for debugging (Method 2) - only in debug mode to avoid leaking sensitive paths
            if (this.debug) {
                if (process.argv && process.argv.length > 0) {
                    this.logger.debug(`Full process.argv (${process.argv.length} args):`);
                    process.argv.forEach((arg: string, index: number) => {
                        this.logger.debug(`  [${index}]: ${arg}`);
                    });
                } else {
                    this.logger.debug('process.argv is not available or empty');
                }

                // Check environment variables - only in debug mode to avoid leaking sensitive data
                this.logger.debug('Checking environment variables...');
                const relevantEnvVars = ['VSCODE_PROFILES', 'VSCODE_PROFILE', 'VSCODE_USER_DATA_DIR', 'VSCODE_CWD'];
                relevantEnvVars.forEach(envVar => {
                    if (process.env[envVar]) {
                        this.logger.debug(`${envVar}: ${process.env[envVar]}`);
                    }
                });
            }

            // Method 1: Check for --user-data-dir argument
            if (process.argv) {
                const userDataDirIndex = process.argv.findIndex((arg: string) => arg && arg.startsWith('--user-data-dir'));
                if (userDataDirIndex !== -1) {
                    let userDataDir = '';
                    if (process.argv[userDataDirIndex].includes('=')) {
                        userDataDir = process.argv[userDataDirIndex].split('=')[1];
                    } else if (userDataDirIndex + 1 < process.argv.length) {
                        userDataDir = process.argv[userDataDirIndex + 1];
                    }

                    if (userDataDir) {
                        this.logger.debug(`Found user-data-dir argument: ${userDataDir}`);
                        return path.join(userDataDir, 'User');
                    }
                }

                // Method 2: Check for --profile argument
                const profileIndex = process.argv.findIndex((arg: string) => arg && arg.startsWith('--profile'));
                if (profileIndex !== -1) {
                    let profileName = '';
                    if (process.argv[profileIndex].includes('=')) {
                        profileName = process.argv[profileIndex].split('=')[1];
                    } else if (profileIndex + 1 < process.argv.length) {
                        profileName = process.argv[profileIndex + 1];
                    }

                    if (profileName) {
                        this.logger.debug(`Found profile argument: ${profileName}`);
                        const baseUserPath = this.getBaseUserPath();
                        return path.join(baseUserPath, 'profiles', profileName);
                    }
                }
            }

            // Method 3: Check for profile by scanning the profiles directory
            this.logger.debug('Attempting file system detection...');
            const baseUserPath = this.getBaseUserPath();
            const profilesDir = path.join(baseUserPath, 'profiles');

            if (fs.existsSync(profilesDir)) {
                if (this.debug) {
                    this.logger.debug(`Profiles directory exists: ${profilesDir}`);
                }
                const profiles = fs.readdirSync(profilesDir).filter((item: string) => {
                    const fullPath = path.join(profilesDir, item);
                    try {
                        return fs.statSync(fullPath).isDirectory();
                    } catch {
                        return false;
                    }
                });

                this.logger.debug(`Found ${profiles.length} profile(s)${this.debug ? ': ' + profiles.join(', ') : ''}`);

                // If there's only one profile, use it (heuristic)
                if (profiles.length === 1) {
                    const detectedProfile = path.join(baseUserPath, 'profiles', profiles[0]);
                    this.logger.debug(`Single profile detected (heuristic)${this.debug ? ': ' + detectedProfile : ''}`);
                    return detectedProfile;
                }

                // Try to detect which profile is currently active by checking recent modifications
                if (profiles.length > 1) {
                    this.logger.debug('Multiple profiles found, checking for most recently active...');

                    let mostRecentProfile = null;
                    let mostRecentTime = 0;

                    profiles.forEach((profile: string) => {
                        try {
                            const settingsPath = path.join(profilesDir, profile, 'settings.json');
                            if (fs.existsSync(settingsPath)) {
                                const stats = fs.statSync(settingsPath);
                                if (this.debug) {
                                    this.logger.debug(`Profile '${profile}' settings modified: ${new Date(stats.mtimeMs).toISOString()}`);
                                }
                                if (stats.mtimeMs > mostRecentTime) {
                                    mostRecentTime = stats.mtimeMs;
                                    mostRecentProfile = profile;
                                }
                            }
                        } catch (err) {
                            if (this.debug) {
                                this.logger.debug(`Error checking profile '${profile}': ${err}`);
                            }
                        }
                    });

                    if (mostRecentProfile) {
                        const detectedProfile = path.join(baseUserPath, 'profiles', mostRecentProfile);
                        this.logger.debug(`Most recently active profile detected: ${mostRecentProfile}${this.debug ? ' at ' + detectedProfile : ''}`);
                        return detectedProfile;
                    }
                }
            } else {
                if (this.debug) {
                    this.logger.debug(`No profiles directory found at: ${profilesDir}`);
                }
            }

            this.logger.debug('No profile detected from environment or file system');
        } catch (error) {
            this.logger.error(`Error during profile detection: ${error}`);
            if (error instanceof Error && error.stack) {
                this.logger.debug(`Error stack: ${error.stack}`);
            }
        }

        return null;
    }

    /**
     * Get the base User path for the current platform
     */
    private getBaseUserPath(): string {
        switch (process.platform) {
            case 'win32':
                return path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User');
            case 'darwin':
                return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
            case 'linux':
                return path.join(os.homedir(), '.config', 'Code', 'User');
            default:
                return path.join(os.homedir(), '.vscode', 'User');
        }
    }

    /**
     * Fallback to hardcoded paths (for backward compatibility when context is not available)
     */
    private getFallbackPromptsDirectory(): string {
        this.logger.warn('Using fallback hardcoded prompts directory paths');

        try {
            let promptsPath: string;
            switch (process.platform) {
                case 'win32':
                    promptsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'prompts');
                    break;
                case 'darwin':
                    promptsPath = path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'prompts');
                    break;
                case 'linux':
                    promptsPath = path.join(os.homedir(), '.config', 'Code', 'User', 'prompts');
                    break;
                default:
                    promptsPath = path.join(os.homedir(), '.vscode', 'prompts');
                    break;
            }

            if (this.debug) {
                this.logger.debug(`Fallback prompts directory: ${promptsPath}`);
            }
            return promptsPath;
        } catch (error) {
            // If Node.js modules are not available, use a reasonable default
            // This should not happen in a VS Code extension context, but provides safety
            throw new Error('Unable to determine prompts directory: Node.js environment not available');
        }
    }

    onConfigurationChanged(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('promptitude')) {
                callback();
            }
        });
    }

    /**
     * Get the set of unique Git providers used in the configured repositories
     */
    getUsedProviders(): Set<GitProvider> {
        const providers = new Set<GitProvider>();
        
        // In getUsedProviders():
        for (const repo of this.repositories) {
            const [url] = repo.split('|');
            try {
                const provider = GitProviderFactory.detectProvider(url);
                if (provider !== 'unknown') {
                    providers.add(provider);
                }
            } catch {
                // Ignore invalid URLs
            }
        }
        
        return providers;
    }

    /**
     * Check if any configured repositories use GitHub
     */
    hasGitHubRepositories(): boolean {
        return this.getUsedProviders().has('github');
    }

    /**
     * Check if any configured repositories use Azure DevOps
     */
    hasAzureDevOpsRepositories(): boolean {
        return this.getUsedProviders().has('azure');
    }

    /**
     * Get repositories grouped by provider
     */
    getRepositoriesByProvider(): Map<GitProvider, string[]> {
        const providerMap = new Map<GitProvider, string[]>();
        
        // Sanitize branch suffix before detection
        for (const repo of this.repositories) {
            const [url] = repo.split('|');
            try {
                const provider = GitProviderFactory.detectProvider(url);
                if (provider !== 'unknown') {
                    if (!providerMap.has(provider)) {
                        providerMap.set(provider, []);
                    }
                    providerMap.get(provider)!.push(repo);
                }
            } catch {
                // Ignore invalid URLs
            }
        }

        return providerMap;
    }
}
