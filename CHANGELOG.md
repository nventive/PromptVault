# VS Code Extension Change Log

All notable changes to the "prompts-sync-extension" extension will be documented in this file.

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

- Initial release of Prompts Sync Extension
- Automatic sync functionality for GitHub Copilot prompts
- Support for configurable sync frequency (startup, hourly, daily, weekly, manual)
- Cross-platform support (macOS, Windows, Linux)
- GitHub authentication integration using VS Code's built-in authentication
- Status bar integration with sync status indicators
- Manual sync command (`Prompts Sync: Sync Now`)
- Status display command (`Prompts Sync: Show Status`)
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

- `promptsSync.enabled` - Enable/disable automatic syncing
- `promptsSync.frequency` - Sync frequency (startup, hourly, daily, weekly, manual)
- `promptsSync.customPath` - Custom prompts directory path
- `promptsSync.repository` - Repository URL to sync from
- `promptsSync.branch` - Repository branch to sync
- `promptsSync.syncOnStartup` - Sync when VS Code starts
- `promptsSync.showNotifications` - Show sync status notifications
- `promptsSync.debug` - Enable debug logging

### Commands

- `promptsSync.syncNow` - Manually trigger sync
- `promptsSync.showStatus` - Show extension status and configuration
