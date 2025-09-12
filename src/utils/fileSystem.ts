import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

export class FileSystemManager {
    async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await stat(dirPath);
        } catch (error) {
            // Directory doesn't exist, create it
            await mkdir(dirPath, { recursive: true });
        }
    }

    async writeFileContent(filePath: string, content: string): Promise<void> {
        const dir = path.dirname(filePath);
        await this.ensureDirectoryExists(dir);
        await writeFile(filePath, content, 'utf8');
    }

    async readFileContent(filePath: string): Promise<string> {
        try {
            return await readFile(filePath, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error}`);
        }
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            await stat(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async isDirectory(dirPath: string): Promise<boolean> {
        try {
            const stats = await stat(dirPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    async getDirectoryContents(dirPath: string): Promise<string[]> {
        try {
            return await readdir(dirPath);
        } catch (error) {
            throw new Error(`Failed to read directory ${dirPath}: ${error}`);
        }
    }

    async copyFile(source: string, destination: string): Promise<void> {
        const content = await this.readFileContent(source);
        await this.writeFileContent(destination, content);
    }

    getRelativePath(from: string, to: string): string {
        return path.relative(from, to);
    }

    joinPath(...paths: string[]): string {
        return path.join(...paths);
    }

    normalizePath(filePath: string): string {
        return path.normalize(filePath);
    }

    getExtension(filePath: string): string {
        return path.extname(filePath);
    }

    getBasename(filePath: string): string {
        return path.basename(filePath);
    }

    getDirname(filePath: string): string {
        return path.dirname(filePath);
    }
}
