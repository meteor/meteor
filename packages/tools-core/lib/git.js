import fs from 'fs';
import path from 'path';
import { logError, logProgress, logSuccess } from './log';

/**
 * Checks if the given directory is a git repository
 * @param {string} dir - Directory to check
 * @returns {boolean} - True if the directory is a git repository
 */
export function isGitRepository(dir) {
  try {
    const gitDir = path.join(dir, '.git');
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a .gitignore file exists in the given directory
 * @param {string} dir - Directory to check
 * @returns {boolean} - True if .gitignore exists
 */
export function gitignoreExists(dir) {
  try {
    const gitignorePath = path.join(dir, '.gitignore');
    return fs.existsSync(gitignorePath);
  } catch (error) {
    return false;
  }
}

/**
 * Creates a .gitignore file in the given directory if it doesn't exist
 * @param {string} dir - Directory where to create .gitignore
 * @param {string[]} [initialEntries=[]] - Initial entries to add to the .gitignore file
 * @returns {boolean} - True if .gitignore was created or already exists
 */
export function ensureGitignoreExists(dir, initialEntries = []) {
  const gitignorePath = path.join(dir, '.gitignore');

  if (!gitignoreExists(dir)) {
    try {
      const content = initialEntries.length > 0 ? initialEntries.join('\n') + '\n' : '';
      fs.writeFileSync(gitignorePath, content, 'utf8');
      return true;
    } catch (error) {
      logError(`=> Failed to create .gitignore: ${error.message}`);
      return false;
    }
  }

  return true;
}

/**
 * Checks if specific entries exist in the .gitignore file
 * @param {string} dir - Directory containing the .gitignore file
 * @param {string[]} entries - Entries to check
 * @returns {string[]} - Entries that don't exist in the .gitignore file
 */
export function getMissingGitignoreEntries(dir, entries) {
  if (!gitignoreExists(dir)) {
    return entries;
  }

  try {
    const gitignorePath = path.join(dir, '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n').map(line => line.trim());

    return entries.filter(entry => !lines.includes(entry));
  } catch (error) {
    logError(`=> Failed to read .gitignore: ${error.message}`);
    return entries;
  }
}

/**
 * Adds entries to the .gitignore file if they don't exist
 * @param {string} dir - Directory containing the .gitignore file
 * @param {string[]} entries - Entries to add
 * @param {string} [context] - Optional context to add as a comment before the entries
 * @returns {boolean} - True if entries were added successfully
 */
export function addGitignoreEntries(dir, entries, context = '') {
  // Ensure .gitignore exists
  if (!ensureGitignoreExists(dir)) {
    return false;
  }

  // Get entries that don't exist
  const missingEntries = getMissingGitignoreEntries(dir, entries);

  if (missingEntries.length === 0) {
    return true; // All entries already exist
  }

  logProgress(`=> Adding gitignore entries${context ? ` for ${context}` : ''}: ${missingEntries.join(', ')}`);

  try {
    const gitignorePath = path.join(dir, '.gitignore');
    let content = '';

    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
      // Ensure there's a newline at the end if the file is not empty
      if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
      }
    }

    // Add context as a comment if provided
    if (context) {
      content += `\n# ${context}\n`;
    }
    content += missingEntries.join('\n') + '\n';
    fs.writeFileSync(gitignorePath, content, 'utf8');

    logSuccess(`=> Added gitignore entries${context ? ` for ${context}` : ''}`);
    return true;
  } catch (error) {
    logError(`=> Failed to add gitignore entries${context ? ` for ${context}` : ''}: ${error.message}`);
    return false;
  }
}
