# Prompts Sync Extension

> Automatically sync GitHub Copilot prompts from the Logient-Nventive shared prompt bank to your local VS Code environment.

## 🎯 Overview

The Prompts Sync Extension automatically synchronizes the latest GitHub Copilot prompts, instructions, and templates from the [prompts-logient-nventive](https://github.com/MounirAbdousNventive/prompts-logient-nventive) repository to your local VS Code user prompts directory. This ensures you always have access to the most up-to-date, peer-reviewed prompts across all your projects.

## ✨ Features

- **🔄 Automatic Sync**: Configurable sync frequency (daily by default)
- **🌍 Cross-Platform**: Works on macOS, Windows, and Linux
- **⚙️ Configurable**: Customizable sync frequency and target directory
- **🔐 Secure**: Uses your existing GitHub authentication from VS Code
- **📦 Read-Only**: Safe pull-only synchronization (no risk of overwriting the repository)
- **🎨 User-Friendly**: Simple setup with minimal configuration required
- **📊 Status Indicators**: Clear feedback on sync status and last update time

## 🚀 Quick Start

### Prerequisites

- VS Code 1.70.0 or higher
- GitHub authentication configured in VS Code
- Access to the [prompts-logient-nventive](https://github.com/MounirAbdousNventive/prompts-logient-nventive) repository

### Installation

1. Download the latest `prompts-sync-extension.vsix` file from the releases
2. Open VS Code
3. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the command palette
4. Type "Extensions: Install from VSIX" and select it
5. Browse and select the downloaded `.vsix` file
6. Restart VS Code when prompted

### First-Time Setup

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "Prompts Sync"
3. Configure your preferences (optional - defaults work for most users)
4. The extension will automatically perform an initial sync

## ⚙️ Configuration

### Extension Settings

| Setting                         | Description                      | Default                                                              | Type    |
| ------------------------------- | -------------------------------- | -------------------------------------------------------------------- | ------- |
| `promptsSync.enabled`           | Enable/disable automatic syncing | `true`                                                               | boolean |
| `promptsSync.frequency`         | Sync frequency                   | `"daily"`                                                            | string  |
| `promptsSync.customPath`        | Custom prompts directory path    | `""`                                                                 | string  |
| `promptsSync.repository`        | Repository URL                   | `"https://github.com/MounirAbdousNventive/prompts-logient-nventive"` | string  |
| `promptsSync.branch`            | Repository branch to sync        | `"master"`                                                           | string  |
| `promptsSync.syncOnStartup`     | Sync when VS Code starts         | `true`                                                               | boolean |
| `promptsSync.showNotifications` | Show sync status notifications   | `true`                                                               | boolean |
| `promptsSync.syncChatmode`      | Sync chatmode prompts            | `true`                                                               | boolean |
| `promptsSync.syncInstructions`  | Sync instructions prompts        | `true`                                                               | boolean |
| `promptsSync.syncPrompt`        | Sync prompt files                | `true`                                                               | boolean |

### Sync Frequency Options

- `"startup"` - Only sync when VS Code starts
- `"hourly"` - Sync every hour
- `"daily"` - Sync once per day (default)
- `"weekly"` - Sync once per week
- `"manual"` - Only sync when manually triggered

### Default Prompts Directory Paths

The extension automatically detects the correct prompts directory for your operating system:

- **macOS**: `~/Library/Application Support/Code/User/prompts`
- **Windows**: `%APPDATA%\Code\User\prompts`
- **Linux**: `~/.config/Code/User/prompts`

You can override this by setting a custom path in `promptsSync.customPath`.

## 🎮 Usage

### Automatic Sync

Once configured, the extension works automatically based on your sync frequency setting. You'll see notifications (if enabled) when sync operations complete.

### Manual Sync

You can manually trigger a sync at any time:

1. Open the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Prompts Sync: Sync Now"
3. Press Enter

### Status Bar

The extension adds a status bar item showing:

- Sync status (✅ synced, 🔄 syncing, ❌ error)
- Last sync time
- Click to manually trigger sync

### View Sync Status

Check detailed sync information:

1. Open the command palette
2. Type "Prompts Sync: Show Status"
3. View sync history, errors, and configuration details

## 📁 Synced Content

The extension syncs all prompt files from the repository subdirectories into a flattened structure:

```
prompts/chatmode/*.md       → User/prompts/
prompts/instructions/*.md   → User/prompts/
prompts/prompt/*.md         → User/prompts/
```

All files are placed directly in the `User/prompts/` directory, removing any subfolder structure for easier access and organization.

## 🔧 Troubleshooting

### Common Issues

#### Sync Fails with Authentication Error

**Problem**: Extension can't access the GitHub repository

**Solutions**:

1. Ensure you're signed into GitHub in VS Code (`View > Command Palette > GitHub: Sign In`)
2. Verify you have access to the repository
3. Check your internet connection

#### Prompts Directory Not Found

**Problem**: Extension can't find or create the prompts directory

**Solutions**:

1. Ensure VS Code has write permissions to the user directory
2. Manually create the prompts directory if it doesn't exist
3. Set a custom path in extension settings

#### Sync Takes Too Long

**Problem**: Sync operation seems stuck

**Solutions**:

1. Check your internet connection
2. Try manual sync to see detailed error messages
3. Restart VS Code and try again

### Debug Mode

Enable debug logging:

1. Open VS Code Settings
2. Search for "promptsSync.debug"
3. Enable debug mode
4. Check the "Prompts Sync" output channel for detailed logs

## 🔒 Security & Privacy

- **Read-Only Access**: The extension only pulls content from the repository
- **No Data Collection**: No usage data or personal information is collected
- **GitHub Authentication**: Uses VS Code's built-in GitHub authentication
- **Local Storage**: All prompts are stored locally on your machine
- **No Network Requests**: Only communicates with GitHub for repository access

## 🛠️ Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/MounirAbdousNventive/prompts-logient-nventive.git
cd prompts-logient-nventive/tools/vscode-extension

# Install dependencies
npm install

# Build the extension
npm run build

# Package the extension
npm run package
```

### Project Structure

```
tools/vscode-extension/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── syncManager.ts        # Sync logic and GitHub integration
│   ├── configManager.ts      # Configuration management
│   ├── statusBarManager.ts   # Status bar integration
│   └── utils/
│       ├── fileSystem.ts     # File system operations
│       ├── github.ts         # GitHub API wrapper
│       └── notifications.ts  # User notifications
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript configuration
├── webpack.config.js        # Build configuration
└── README.md               # This file
```

### Scripts

- `npm run build` - Build the extension
- `npm run watch` - Build in watch mode
- `npm run package` - Create VSIX package
- `npm run test` - Run tests
- `npm run lint` - Run ESLint

## 📊 Extension Manifest

Key details from `package.json`:

```json
{
  "name": "prompts-sync-extension",
  "displayName": "Prompts Sync Extension",
  "description": "Sync GitHub Copilot prompts from Logient-Nventive shared repository",
  "version": "1.0.0",
  "publisher": "logient-nventive",
  "engines": {
    "vscode": "^1.70.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "configuration": {
      "title": "Prompts Sync",
      "properties": {
        "promptsSync.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable automatic prompts synchronization"
        },
        "promptsSync.frequency": {
          "type": "string",
          "enum": ["startup", "hourly", "daily", "weekly", "manual"],
          "default": "daily",
          "description": "Frequency of automatic sync"
        }
      }
    },
    "commands": [
      {
        "command": "promptsSync.syncNow",
        "title": "Sync Now",
        "category": "Prompts Sync"
      },
      {
        "command": "promptsSync.showStatus",
        "title": "Show Status",
        "category": "Prompts Sync"
      }
    ]
  }
}
```

## 🤝 Contributing

We welcome contributions to improve the extension! Please see our [Contribution Guide](../../docs/contribution-guide.md) for details.

### Reporting Issues

1. Check existing issues in the repository
2. Create a new issue with:
   - Extension version
   - VS Code version
   - Operating system
   - Detailed description of the problem
   - Steps to reproduce

### Feature Requests

1. Open an issue with the "enhancement" label
2. Describe the desired functionality
3. Explain the use case and benefits

## 📋 Changelog

### Version 1.1.0 (Selective Sync & Flattened Structure)

- ✅ **New Feature**: Selective sync settings for different prompt types
- ✅ Added `promptsSync.syncChatmode` setting (default: true)
- ✅ Added `promptsSync.syncInstructions` setting (default: true)
- ✅ Added `promptsSync.syncPrompt` setting (default: true)
- ✅ Flattened folder structure - all files sync directly to `User/prompts/`
- ✅ Enhanced status display showing selected sync types
- ✅ Improved configurability and user control

### Version 1.0.0 (Initial Release)

- ✅ Basic sync functionality
- ✅ Configurable sync frequency
- ✅ Cross-platform support
- ✅ GitHub authentication integration
- ✅ Status bar integration
- ✅ User notifications
- ✅ Manual sync commands

## 📄 License

Internal use only - Logient/Nventive Development Team

## 📞 Support

For support and questions:

- Create an issue in the [repository](https://github.com/MounirAbdousNventive/prompts-logient-nventive/issues)
- Contact the DevOps team
- Check the [troubleshooting section](#-troubleshooting) above

---

**Made with ❤️ by the Logient-Nventive DevOps Team**
