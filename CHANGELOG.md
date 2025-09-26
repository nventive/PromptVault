# VS Code Extension Change Log

All notable changes to the "promptitude" extension will be documented in this file.

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
