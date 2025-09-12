# VS Code Extension Installation & Testing Guide

## Installation Options

### Option 1: Install from VSIX File (Recommended for Testing)

1. **Install the extension:**

   ```bash
   code --install-extension prompts-sync-extension-1.0.0.vsix
   ```

2. **Or install via VS Code UI:**
   - Open VS Code
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Type "Extensions: Install from VSIX"
   - Select the `prompts-sync-extension-1.0.0.vsix` file

### Option 2: Development Mode

1. **Open in VS Code:**

   ```bash
   code /Users/mounir.abdous/Projects/prompts-logient-nventive/tools/vscode-extension
   ```

2. **Press F5 to launch Extension Development Host**

## Testing the Extension

### 1. Initial Setup

1. **Check GitHub Authentication:**

   - Open Command Palette (`Ctrl+Shift+P`)
   - Type "GitHub: Sign In" if not already authenticated

2. **Configure Extension (Optional):**
   - Go to Settings (`Ctrl+,`)
   - Search for "Prompts Sync"
   - Adjust settings as needed

### 2. Test Manual Sync

1. **Open Command Palette** (`Ctrl+Shift+P`)
2. **Type:** "Prompts Sync: Sync Now"
3. **Check status bar** for sync progress indicators
4. **Verify prompts directory** was created and populated

### 3. Test Status Display

1. **Open Command Palette** (`Ctrl+Shift+P`)
2. **Type:** "Prompts Sync: Show Status"
3. **Review configuration** and status information

### 4. Check Debug Logs

1. **Enable debug mode:**
   - Settings → Search "promptsSync.debug" → Enable
2. **View logs:**
   - View → Output → Select "Prompts Sync" channel

## Expected Behavior

### First Run

- Extension activates automatically
- Status bar shows "Prompts" with cloud icon
- If `syncOnStartup` is enabled, performs initial sync
- Creates prompts directory structure

### Successful Sync

- Status bar shows checkmark icon
- Notification appears (if enabled)
- Prompts directory populated with:
  - `prompts/` folder with development and code-review content
  - `copilot-instructions/` folder
  - `language-guidelines/` folder

### Default Prompts Directory Locations

- **macOS:** `~/Library/Application Support/Code/User/prompts`
- **Windows:** `%APPDATA%\\Code\\User\\prompts`
- **Linux:** `~/.config/Code/User/prompts`

## Troubleshooting

### Common Issues

1. **Authentication Error:**

   - Ensure GitHub is connected in VS Code
   - Check repository access permissions

2. **Sync Fails:**

   - Check internet connection
   - Verify repository URL in settings
   - Check debug logs for detailed error

3. **Directory Permissions:**
   - Ensure VS Code has write permissions to user directory
   - Try setting custom path in settings

### Debug Commands

```bash
# Check if extension is loaded
code --list-extensions | grep prompts-sync

# View extension logs
# Open VS Code → View → Output → Select "Prompts Sync"

# Reset extension data
# Close VS Code, delete prompts directory, restart VS Code
```

## Development Commands

```bash
# Build extension
npm run compile

# Watch for changes
npm run watch

# Package extension
npx @vscode/vsce package

# Install locally
code --install-extension prompts-sync-extension-1.0.0.vsix

# Uninstall
code --uninstall-extension logient-nventive.prompts-sync-extension
```

## Extension Structure Verification

The extension should create this structure in your prompts directory:

```
User/prompts/
├── prompts/
│   ├── development/
│   │   └── react-component.md
│   └── code-review/
│       └── code-review.md
├── copilot-instructions/
│   └── general/
│       └── copilot-instructions.md
└── language-guidelines/
    ├── README.md
    ├── general/
    ├── typescript/
    ├── javascript/
    ├── python/
    └── csharp/
```
