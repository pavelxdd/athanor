import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import type { IGitService, CommitLog, GitCommitsForFileOptions, GitFileStatus } from '../../common/types/git-service';
import { PathUtils } from './PathUtils';



export class GitService implements IGitService {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = PathUtils.normalizeToUnix(baseDir);
  }

  /**
   * Set the base directory for Git operations
   * @param baseDir Absolute path to the Git repository root
   */
  setBaseDir(baseDir: string): void {
    this.baseDir = PathUtils.normalizeToUnix(baseDir);
  }

  /**
   * Get the current base directory
   * @returns Current Git repository base directory
   */
  getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Check if the current directory is a Git repository
   * @returns True if .git directory exists and git commands can be executed
   */
  async isGitRepository(): Promise<boolean> {
    try {
      // Check for .git directory
      const gitDir = PathUtils.joinUnix(this.baseDir, '.git');
      const platformGitDir = PathUtils.toPlatform(gitDir);
      
      await fs.access(platformGitDir);
      
      // Verify git command works in this directory
      await this.executeGitCommand('rev-parse --git-dir');
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get commit history for a specific file
   * @param filePath Project-relative path to the file
   * @param options Optional parameters for limiting results
   * @returns Array of commit log entries
   */
  async getCommitsForFile(filePath: string, options: GitCommitsForFileOptions = {}): Promise<CommitLog[]> {
    try {
      if (!(await this.isGitRepository())) {
        return [];
      }

      const { maxCount = 50, since } = options;
      
      // Build git log command
      let command = `log --format=%H|%s|%an|%ai --follow`;
      
      if (maxCount > 0) {
        command += ` -n ${maxCount}`;
      }
      
      if (since) {
        command += ` --since="${since}"`;
      }

      command += ` -- "${filePath}"`;
      
      const output = await this.executeGitCommand(command);
      
      if (!output || !output.trim()) {
        return [];
      }
      
      return this.parseCommitLog(output);
    } catch (error) {
      console.error(`Error getting commits for file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get list of files modified in a specific commit
   * @param commitHash The commit hash to analyze
   * @returns Array of project-relative file paths
   */
  async getFilesForCommit(commitHash: string): Promise<string[]> {
    try {
      if (!(await this.isGitRepository())) {
        return [];
      }

      const command = `show --name-only --format="" ${commitHash}`;
      const output = await this.executeGitCommand(command);
      
      if (!output || !output.trim()) {
        return [];
      }
      
      return output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => PathUtils.normalizeToUnix(line));
    } catch (error) {
      console.error(`Error getting files for commit ${commitHash}:`, error);
      return [];
    }
  }

  /**
   * Get list of files that have been committed recently
   * @param daysAgo Number of days to look back
   * @returns Array of project-relative file paths
   */
  async getRecentlyCommittedFiles(daysAgo: number): Promise<string[]> {
    try {
      if (!(await this.isGitRepository())) {
        return [];
      }

      const command = `log --name-only --format="" --since="${daysAgo} days ago"`;
      const output = await this.executeGitCommand(command);
      
      if (!output || !output.trim()) {
        return [];
      }
      
      // Parse output and deduplicate files
      const files = new Set<string>();
      
      output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .forEach(line => {
          files.add(PathUtils.normalizeToUnix(line));
        });
      
      return Array.from(files);
    } catch (error) {
      console.error(`Error getting recently committed files:`, error);
      return [];
    }
  }

  /**
   * Get recent commit hashes for the entire repository
   * @param maxCount The maximum number of commit hashes to return
   * @returns Array of commit hashes
   */
  async getRecentCommitHashes(maxCount: number): Promise<string[]> {
    try {
      if (!(await this.isGitRepository())) {
        return [];
      }

      const command = `log --pretty=format:%H -n ${maxCount}`;
      const output = await this.executeGitCommand(command);

      if (!output || !output.trim()) {
        return [];
      }

      return output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch (error) {
      console.error(`Error getting recent commit hashes:`, error);
      return [];
    }
  }

  /**
   * Get uncommitted changes in the repository, including untracked files.
   * @returns Array of files with their status (Added, Modified, Deleted)
   */
  async getUncommittedChanges(): Promise<GitFileStatus[]> {
    if (!(await this.isGitRepository())) {
      return [];
    }

    let trackedChanges: GitFileStatus[] = [];
    try {
      // Get modified, staged, and deleted files compared to HEAD
      const output = await this.executeGitCommand('diff --name-status HEAD');
      if (output.trim()) {
        trackedChanges = output
          .split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [status, path] = line.split('\t');
            return { status: status.trim() as 'A' | 'M' | 'D', path: PathUtils.normalizeToUnix(path) };
          });
      }
    } catch (error) {
      console.error('Error getting tracked uncommitted changes:', error);
      // Don't return, as we might still get untracked files
    }

    let untrackedChanges: GitFileStatus[] = [];
    try {
      // Get new (untracked) files, respecting .gitignore
      const untrackedOutput = await this.executeGitCommand(
        'ls-files --others --exclude-standard'
      );
      if (untrackedOutput.trim()) {
        untrackedChanges = untrackedOutput
          .split('\n')
          .filter(line => line.trim())
          .map(path => ({
            status: 'A' as const, // Untracked files are additions
            path: PathUtils.normalizeToUnix(path),
          }));
      }
    } catch (error) {
      console.error('Error getting untracked files:', error);
    }

    return [...trackedChanges, ...untrackedChanges];
  }

  /**
   * Get the content of a file at the HEAD commit
   * @param filePath Project-relative path to the file
   * @returns File content as a string, or an empty string if not found or on error
   */
  async getContentAtHead(filePath: string): Promise<string> {
    if (!(await this.isGitRepository())) {
      return '';
    }
    try {
      // Git pathspecs (rev:path) must use forward slashes, even on Windows.
      // The filePath argument is already in the correct normalized Unix format.
      const output = await this.executeGitCommand(`show HEAD:${filePath}`);
      return output;
    } catch (error) {
      // This is expected for newly added files. Return empty string.
      return '';
    }
  }

  // Whitelist of allowed git commands for security
  private readonly ALLOWED_GIT_COMMANDS = new Set([
    'diff',
    'show',
    'log',
    'status',
    'rev-parse',
    'ls-files',
  ]);

  // Timeout for git command execution (30 seconds)
  private readonly GIT_COMMAND_TIMEOUT = 30000;

  /**
   * Validate git command for security
   * - Checks against whitelist of allowed commands
   * - Prevents shell injection by banning dangerous characters
   */
  private isValidGitCommand(command: string): boolean {
    const trimmedCommand = command.trim();
    
    // Extract base command (first word) for whitelist validation
    const baseCommand = trimmedCommand.split(/\s+/)[0];
    
    // Security check: validate against whitelist
    if (!this.ALLOWED_GIT_COMMANDS.has(baseCommand)) {
      console.warn(`Git command not allowed: ${baseCommand}`);
      return false;
    }
    
    // Prevent shell injection by banning dangerous characters
    // These characters could allow command chaining or redirection when using shell
    // Note: We use spawn without shell, so most characters are safe, but we still ban
    // characters that could cause issues or are clearly dangerous
    // Pipe (|) is allowed as it's used in git log format strings
    // Backtick (`) and exclamation (!) are not dangerous with spawn without shell
    const dangerousChars = /[;&$>\n\r]/;
    if (dangerousChars.test(trimmedCommand)) {
      console.warn(`Git command contains dangerous characters: ${trimmedCommand}`);
      return false;
    }
    
    return true;
  }

  /**
   * Parse git command arguments, properly handling quoted strings
   * @param command The git command string (without 'git' prefix)
   * @returns Array of command arguments
   */
  private parseGitCommandArgs(command: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let i = 0;

    while (i < command.length) {
      const char = command[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        // Start of quoted string - include the quotes
        inQuotes = true;
        quoteChar = char;
        current += char; // Include the opening quote
        i++;
      } else if (char === quoteChar && inQuotes) {
        // End of quoted string - include the quotes
        inQuotes = false;
        current += char; // Include the closing quote
        i++;
        // Check if next character is a space and we're not at the end
        if (i < command.length && command[i] === ' ') {
          // End of quoted argument
          if (current) {
            args.push(current);
            current = '';
          }
          i++; // Skip the space
        }
      } else if (char === ' ' && !inQuotes) {
        // Space outside quotes - end of argument
        if (current) {
          args.push(current);
          current = '';
        }
        i++; // Skip the space
      } else {
        // Regular character or space inside quotes
        current += char;
        i++;
      }
    }

    // Add the last argument if there is one
    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Execute a git command in the base directory.
   *
   * ⚠️ SECURITY WARNING: This method executes git commands and is restricted
   * to a whitelist of safe, read-only git commands. Only call with trusted input.
   *
   * Allowed commands: diff, show, log, status, rev-parse, ls-files
   *
   * @param command Git command to execute (without 'git' prefix)
   * @returns Command output
   * @throws Error if command is not allowed, execution fails, or times out
   * @public
   */
  public async executeGitCommand(command: string): Promise<string> {
    // Validate command is not empty
    if (!command || !command.trim()) {
      throw new Error('Git command cannot be empty');
    }

    const trimmedCommand = command.trim();

    // Security validation
    if (!this.isValidGitCommand(trimmedCommand)) {
      const baseCommand = trimmedCommand.split(/\s+/)[0];
      throw new Error(
        `Git command "${baseCommand}" is not allowed or contains dangerous characters. ` +
        `Allowed commands: ${Array.from(this.ALLOWED_GIT_COMMANDS).join(', ')}`
      );
    }

    const platformBaseDir = PathUtils.toPlatform(this.baseDir);

    return new Promise<string>((resolve, reject) => {
      // Parse command arguments properly, handling quoted strings
      const args = this.parseGitCommandArgs(trimmedCommand);

      // Create git process without shell to prevent injection
      const childProcess = spawn('git', args, {
        cwd: platformBaseDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        // Do not use shell to prevent command injection
        shell: false,
      });

      // Set up timeout to kill the process if it takes too long
      const timeoutId = setTimeout(() => {
        childProcess.kill('SIGTERM');
        reject(new Error(`Git command timed out after ${this.GIT_COMMAND_TIMEOUT / 1000} seconds: git ${trimmedCommand}`));
      }, this.GIT_COMMAND_TIMEOUT);

      let stdoutData = '';
      let stderrData = '';

      childProcess.stdout.on('data', (data) => {
        const dataStr = data.toString('utf8');
        stdoutData += dataStr;

        // Safety check: limit output size to 10MB
        if (stdoutData.length > 10 * 1024 * 1024) {
          clearTimeout(timeoutId);
          childProcess.kill('SIGTERM');
          reject(new Error('Git command output exceeds 10MB limit'));
        }
      });
      
      childProcess.stderr.on('data', (data) => {
        stderrData += data.toString('utf8');
      });
      
      childProcess.on('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timeoutId);
        // Check if git is not installed
        if (error.code === 'ENOENT') {
          reject(new Error('Git is not installed or not available in PATH'));
        } else {
          reject(error);
        }
      });
      
      // Handle close event - only register once
      childProcess.once('close', (code) => {
        clearTimeout(timeoutId);

        if (stderrData && stderrData.trim()) {
          console.warn(`Git command stderr: ${stderrData}`);
        }

        if (code === 0) {
          resolve(stdoutData);
        } else {
          reject(new Error(`Git command failed with code ${code}: ${stderrData || 'Unknown error'}`));
        }
      });
    });
  }

  /**
   * Parse git log output into CommitLog objects
   * @param output Raw git log output
   * @returns Array of parsed commit log entries
   */
  private parseCommitLog(output: string): CommitLog[] {
    const commits: CommitLog[] = [];
    
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines) {
      const parts = line.split('|');
      
      if (parts.length >= 4) {
        commits.push({
          hash: parts[0].trim(),
          message: parts[1].trim(),
          author: parts[2].trim(),
          date: parts[3].trim(),
        });
      }
    }
    
    return commits;
  }
}
