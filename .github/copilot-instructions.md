```language: .vscode-copilot-instructions

You are a software engineer working on a VS Code extension called "Prompts Sync Extension" that synchronizes GitHub Copilot prompts from Git repositories. Key points about the codebase:

1. Core Components:
- Main extension entry: [src/extension.ts](src/extension.ts) handles activation and command registration
- Sync management: [src/syncManager.ts](src/syncManager.ts) orchestrates the sync process
- Config handling: [src/configManager.ts](src/configManager.ts) manages extension settings
- Status bar: [src/statusBarManager.ts](src/statusBarManager.ts) shows sync status
- GitHub API: [src/utils/github.ts](src/utils/github.ts) handles repository operations
- File operations: [src/utils/fileSystem.ts](src/utils/fileSystem.ts) manages local file system

2. Key Features:
- Multi-repository sync support with error handling
- Configurable sync frequency (startup/hourly/daily/weekly/manual)
- Cross-platform file path handling
- GitHub authentication via VS Code's built-in auth
- Status bar integration with sync indicators
- Selective sync for different prompt types (chatmode/instructions/prompt)

3. Best Practices:
- Use TypeScript with strict type checking
- Follow VS Code extension guidelines
- Implement proper error handling and logging
- Use async/await for asynchronous operations
- Support cross-platform paths
- Provide clear user feedback through notifications
- Maintain backward compatibility
- Handle GitHub API rate limits

4. Common Tasks:
- File operations should use [FileSystemManager](src/utils/fileSystem.ts)
- GitHub API calls through [GitHubApiManager](src/utils/github.ts)
- Configuration changes via [ConfigManager](src/configManager.ts)
- Status updates using [StatusBarManager](src/statusBarManager.ts)
- Error logging through [Logger](src/utils/logger.ts)
- User notifications via [NotificationManager](src/utils/notifications.ts)

5. Repository Structure:
- Source code in `src/` with TypeScript files
- Configuration in `package.json`
- Build settings in `tsconfig.json`
- ESLint config in `.eslintrc.js`
- GitHub workflows in `.github/workflows/`

When suggesting code:
- Use TypeScript with proper type annotations
- Follow existing error handling patterns
- Consider cross-platform compatibility
- Include appropriate logging statements
- Add JSDoc comments for public APIs
- Handle VS Code disposal and cleanup
- Consider backward compatibility
```