# VS Code Extension Change Log

All notable changes to the "promptitude" extension will be documented in this file.

## [Unreleased]

### Fixed

- **Repository Slug Encoding**: Replaced lossy underscore-based repository slug encoding with reversible Base64 URL encoding
  - Moved repository slugging into shared helper `src/storage/repositoryStorage.ts`
  - Added `encodeRepositorySlug` and `decodeRepositorySlug` functions using Base64 URL encoding
  - Implemented automatic migration from legacy underscore-based slugs to new format
  - Prevents data loss from ambiguous URL-to-slug conversions (e.g., URLs with underscores)

- **Repository Path Resolution**: Fixed cross-platform repository path resolution for inactive prompts
  - Removed hard-coded macOS-only paths in `promptDetailsWebview.ts`
  - Now uses `ConfigManager.getPromptsDirectory()` for cross-platform support
  - Fixed path resolution to use migrated storage location
  - Enables details view for repository-sourced prompts on all platforms

- **Bulk Deactivate**: Fixed critical bug where bulk-deactivate left symlinks on disk
  - Updated `deselectAll()` to properly remove symlinks via `syncManager.deactivatePrompt()`
  - Previously only flipped boolean flags without removing actual files
  - Now properly deactivates all prompts and cleans up symlinks

- **Duplicate Prompt Detection**: Fixed insufficient duplicate detection causing prompt conflation
  - Added `findPromptByNameAndRepository()` method using composite key (filename + repository URL)
  - Prevents prompts with same filename from different repositories being conflated
  - Each repository's version of a prompt is now properly loaded and tracked

- **Branch Suffix Handling**: Fixed repository path computation in cleanup operations
  - Updated `cleanupOrphanedPrompts()` to use `repositoryConfigs` instead of raw repository URLs
  - Properly strips branch suffix before computing repository paths
  - Ensures consistent path resolution across all operations

- **Code Quality**: Removed variable shadowing of imported modules
  - Removed local `const path = require('path')` declarations
  - Added top-level `import * as path from 'path'` where needed
  - Improved code consistency and eliminated confusion

- **UI Cleanup**: Removed console.log statements and unused imports
  - Removed debug console.log statements from webview code
  - Removed unused `PromptInfo` import from `promptCardsWebview.ts`
  - Removed unused `timestamp` variable

## [1.5.0] - 2025-11-12

### Fixed

- Enhanced logging and removed console.logs
- Improved code quality and performance optimizations

## [1.4.0] - 2025-10-03

### Added

- **Azure DevOps Support**: Support for Azure DevOps repositories including both modern (`dev.azure.com`) and legacy (`visualstudio.com`) URL formats

- **Multiple Personal Access Token (PAT) Support**: Support for multiple Azure DevOps PATs with intelligent caching
  - Automatically tries all configured PATs until one works for a given organization
  - Caches successful PAT-to-organization mappings for optimal performance
  - PATs are securely stored using VS Code's SecretStorage API

- **New Azure DevOps Management Commands**:
  - `Promptitude: Add Azure DevOps Personal Access Token` - Add a new PAT to the list
  - `Promptitude: Remove Azure DevOps Personal Access Token(s)` - Remove specific or all PATs
  - `Promptitude: Clear Azure DevOps Authentication Cache` - Clear organization-to-PAT cache

- **Open Prompts Folder Command**: New command to quickly open the prompts directory in your system's file explorer


### Configuration

- Repository configuration now supports Azure DevOps URLs in addition to GitHub:
  - `https://dev.azure.com/org/project/_git/repo`
  - `https://dev.azure.com/org/project/_git/repo|branch`
  - `https://org.visualstudio.com/project/_git/repo`
  - `https://org.visualstudio.com/project/_git/repo|branch`
  - `https://org.visualstudio.com/_git/repo`
- URLs with encoded spaces and special characters are now properly supported

### Fixed

- Branch specification now works correctly for all repository types
- Authentication prompts no longer appear twice
- File filtering is more reliable with better logging
- Extension name consistently shows as "Promptitude" throughout the UI

## [1.3.0] - 2025-09-25

### Changed

- Configuration now supports per-repository branch selection via `promptitude.repositories` entries in the form `https://github.com/owner/repo|branch`.
- **Breaking** Removed the separate `promptitude.branch` setting. If no branch is provided for an entry, `main` is used by default.

## [1.2.0] - 2025-09-22

- Renamed extension to promptitude for better visibility on vscode extensions marketplace.

## [1.1.0] - 2025-09-01

### Changed

- **Breaking**: Updated to support new repository folder structure
- Consolidated folder structure: now syncs only from `prompts/` directory
- Removed support for separate `copilot-instructions/` and `language-guidelines/` directories
- Updated to support new subdirectories: `prompts/chatmode/`, `prompts/instructions/`, `prompts/prompt/`
- Updated documentation to reflect new folder structure

### Synced Content (Updated)

- `prompts/chatmode/` directory → User prompts/chatmode/
- `prompts/instructions/` directory → User prompts/instructions/
- `prompts/prompt/` directory → User prompts/prompt/

## [1.0.0] - 2025-09-01

### Added

- Initial release of Promptitude Extension
- Automatic sync functionality for GitHub Copilot prompts
- Support for configurable sync frequency (startup, hourly, daily, weekly, manual)
- Cross-platform support (macOS, Windows, Linux)
- GitHub authentication integration using VS Code's built-in authentication
- Status bar integration with sync status indicators
- Manual sync command (`Promptitude: Sync Now`)
- Status display command (`Promptitude: Show Status`)
- Comprehensive logging and debug mode
- User notifications for sync operations
- Configurable prompts directory with smart defaults
- Support for syncing from custom repository URLs and branches

### Features

- **Automatic Sync**: Configurable sync frequency with smart scheduling
- **Security**: Uses VS Code's GitHub authentication, read-only repository access
- **User Experience**: Clear status indicators, notifications, and error handling
- **Flexibility**: Customizable repository URL, branch, and target directory
- **Debugging**: Comprehensive logging with debug mode for troubleshooting

### Synced Content (Original)

- `prompts/` directory → User prompts directory
- `copilot-instructions/` directory → User prompts/copilot-instructions
- `language-guidelines/` directory → User prompts/language-guidelines

### Configuration Options

- `promptitude.enabled` - Enable/disable automatic syncing
- `promptitude.frequency` - Sync frequency (startup, hourly, daily, weekly, manual)
- `promptitude.customPath` - Custom prompts directory path
- `promptitude.repository` - Repository URL to sync from
- `promptitude.branch` - Repository branch to sync
- `promptitude.syncOnStartup` - Sync when VS Code starts
- `promptitude.showNotifications` - Show sync status notifications
- `promptitude.debug` - Enable debug logging

### Commands

- `promptitude.syncNow` - Manually trigger sync
- `promptitude.showStatus` - Show extension status and configuration
