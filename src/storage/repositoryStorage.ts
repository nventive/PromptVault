import { Logger } from '../utils/logger';

const logger = Logger.get('RepositoryStorage');

/**
 * Encode a repository URL into a safe, reversible slug using Base64 URL encoding
 * @param url The repository URL to encode
 * @returns A Base64 URL-encoded slug that can be safely used as a directory name
 */
export function encodeRepositorySlug(url: string): string {
    try {
        // Use base64url encoding (URL-safe variant without padding)
        return Buffer.from(url, 'utf8').toString('base64url');
    } catch (error) {
        logger.error(`Failed to encode repository URL: ${url}`, error instanceof Error ? error : undefined);
        throw new Error(`Failed to encode repository URL: ${error}`);
    }
}

/**
 * Decode a repository slug back to its original URL
 * @param slug The Base64 URL-encoded slug
 * @returns The original repository URL
 */
export function decodeRepositorySlug(slug: string): string {
    try {
        // Decode from base64url
        return Buffer.from(slug, 'base64url').toString('utf8');
    } catch (error) {
        logger.error(`Failed to decode repository slug: ${slug}`, error instanceof Error ? error : undefined);
        throw new Error(`Failed to decode repository slug: ${error}`);
    }
}
