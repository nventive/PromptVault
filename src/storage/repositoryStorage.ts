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

/**
 * Check if a slug is in the legacy underscore-based format
 * Legacy slugs are lowercase and contain underscores but are not valid base64url
 * @param slug The slug to check
 * @returns True if the slug appears to be in legacy format
 */
export function isLegacySlug(slug: string): boolean {
    // Base64url uses alphanumeric, dash, and underscore characters
    // Legacy slugs are lowercase with underscores from URL character replacement
    
    // If it successfully decodes as base64url and looks like a URL, it's not legacy
    try {
        const decoded = Buffer.from(slug, 'base64url').toString('utf8');
        // Check if decoded string looks like a URL (has protocol or domain pattern)
        if (decoded.includes('://') || decoded.match(/^[a-z0-9\-\.]+\.[a-z]{2,}/i)) {
            return false;
        }
    } catch {
        // If decoding fails, it might be legacy
    }

    // Legacy format characteristics:
    // - All lowercase
    // - Contains underscores (from character replacement)
    // - May contain dots and dashes
    // - No uppercase letters (base64url can have uppercase)
    const hasUppercase = /[A-Z]/.test(slug);
    const hasUnderscores = slug.includes('_');
    const isLowercase = slug === slug.toLowerCase();
    
    // Legacy: lowercase with underscores and no uppercase
    return isLowercase && hasUnderscores && !hasUppercase;
}

/**
 * Convert a legacy underscore-based slug to the original URL
 * This is a best-effort conversion and may not be 100% accurate for all cases
 * @param legacySlug The legacy underscore-based slug
 * @returns The reconstructed repository URL
 */
export function legacySlugToUrl(legacySlug: string): string {
    // Reverse the legacy encoding process:
    // 1. Replace underscores with slashes
    // 2. Add https:// prefix
    const reconstructed = legacySlug.replace(/_/g, '/');
    
    // Add protocol if not present
    if (!reconstructed.startsWith('http://') && !reconstructed.startsWith('https://')) {
        return 'https://' + reconstructed;
    }
    
    return reconstructed;
}

/**
 * Migrate a legacy slug to the new base64url format
 * @param legacySlug The legacy underscore-based slug
 * @returns The new base64url-encoded slug
 */
export function migrateLegacySlug(legacySlug: string): string {
    const url = legacySlugToUrl(legacySlug);
    return encodeRepositorySlug(url);
}
