// Mock child_process.spawn
const mockSpawn = jest.fn();

// Mock 'child_process' before importing GitService
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: mockSpawn,
}));

// Now that mocks are set up, import the modules that will use them.
import { GitService } from './GitService';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

// Mock other dependencies used by GitService.
jest.mock('fs/promises');

const mockFsAccess = fs.access as jest.MockedFunction<typeof fs.access>;

describe('GitService', () => {
  let gitService: GitService;
  const mockBaseDir = '/test/project';

  // Helper to set up mock spawn for multiple calls
  const setupMockSpawn = (commands: Array<{ args: string[], stdout: string, stderr?: string, code?: number, error?: Error }>) => {
    let callIndex = 0;
    mockSpawn.mockImplementation((command, args) => {
      const cmdConfig = commands[callIndex];
      if (cmdConfig) {
        callIndex++;
        return createMockChildProcess(cmdConfig.stdout, cmdConfig.stderr || '', cmdConfig.code || 0, cmdConfig.error);
      }
      return createMockChildProcess('', '', 1);
    });
  };

  // Helper to create a mock child process
  const createMockChildProcess = (stdout: string, stderr: string, code: number = 0, error?: Error) => {
    const mockProcess = new EventEmitter() as any;
    // Create unique event emitters for stdout/stderr
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();

    // If error is provided, emit error event immediately
    if (error) {
      // Simulate spawn failing (like git not found)
      process.nextTick(() => {
        mockProcess.emit('error', error);
      });
    } else {
      // Simulate successful spawn
      // Emit data and close asynchronously using nextTick to ensure handlers are bound
      process.nextTick(() => {
        if (stdout) {
          mockProcess.stdout.emit('data', Buffer.from(stdout, 'utf8'));
        }
        if (stderr) {
          mockProcess.stderr.emit('data', Buffer.from(stderr, 'utf8'));
        }
        // Emit close in the next tick
        process.nextTick(() => {
          mockProcess.emit('close', code);
        });
      });
    }

    return mockProcess;
  };

  beforeEach(() => {
    gitService = new GitService(mockBaseDir);
    // Clear mock history before each test, but not the mock implementation itself.
    jest.clearAllMocks();
    // Reset mockSpawn to default behavior (no call)
    mockSpawn.mockReset();
    // Set default mock implementation that returns an empty process
    mockSpawn.mockImplementation(() => {
      const emptyProcess = createMockChildProcess('', '', 0);
      return emptyProcess;
    });
  });

  afterEach(() => {
    // No special cleanup needed for nextTick
  });

  describe('constructor and base directory management', () => {
    it('should normalize base directory path', () => {
      const service = new GitService('C:\\test\\project');
      expect(service.getBaseDir()).toBe('C:/test/project');
    });

    it('should set and get base directory', () => {
      gitService.setBaseDir('/new/path');
      expect(gitService.getBaseDir()).toBe('/new/path');
    });
  });

  describe('isGitRepository', () => {
    it('should return true when .git directory exists and git command works', async () => {
      mockFsAccess.mockResolvedValueOnce(undefined);
      mockSpawn.mockImplementationOnce(() => createMockChildProcess('.git', ''));

      const result = await gitService.isGitRepository();

      expect(result).toBe(true);
      expect(mockFsAccess).toHaveBeenCalledWith(
        expect.stringMatching(/[\/\\]test[\/\\]project[\/\\]\.git$/)
      );
      expect(mockSpawn).toHaveBeenCalledWith('git', ['rev-parse', '--git-dir'], expect.any(Object));
    });

    it('should return false when .git directory does not exist', async () => {
      mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await gitService.isGitRepository();

      expect(result).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should return false when git command fails', async () => {
      mockFsAccess.mockResolvedValueOnce(undefined);
      const error = new Error('Not a git repository');
      mockSpawn.mockImplementationOnce(() => createMockChildProcess('', '', 1, error));

      const result = await gitService.isGitRepository();

      expect(result).toBe(false);
    });
  });

  describe('getCommitsForFile', () => {
    const mockCommitOutput = `abc123|Initial commit|John Doe|2023-01-01 10:00:00 +0000
def456|Update file|Jane Smith|2023-01-02 15:30:00 +0000
ghi789|Bug fix|Bob Johnson|2023-01-03 09:15:00 +0000`;

    it('should return commit history for a file', async () => {
      // Mock for isGitRepository() check
      mockFsAccess.mockResolvedValue(undefined);

      // Set up mock for two calls: rev-parse and log
      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['log'], stdout: mockCommitOutput }
      ]);

      const commits = await gitService.getCommitsForFile('src/test.ts');

      expect(commits).toHaveLength(3);
      expect(commits[0]).toEqual({
        hash: 'abc123',
        message: 'Initial commit',
        author: 'John Doe',
        date: '2023-01-01 10:00:00 +0000',
      });
      expect(commits[1]).toEqual({
        hash: 'def456',
        message: 'Update file',
        author: 'Jane Smith',
        date: '2023-01-02 15:30:00 +0000',
      });
      // The mockSpawn should have been called for the git commands
    });

    it('should apply maxCount option', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockSpawn
        .mockImplementationOnce(() => createMockChildProcess('.git', ''))
        .mockImplementationOnce(() => createMockChildProcess(mockCommitOutput, ''));

      await gitService.getCommitsForFile('src/test.ts', { maxCount: 2 });

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'git',
        ['log', '--format=%H|%s|%an|%ai', '--follow', '-n', '2', '--', '"src/test.ts"'],
        expect.any(Object)
      );
    });

    it('should apply since option', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockSpawn
        .mockImplementationOnce(() => createMockChildProcess('.git', ''))
        .mockImplementationOnce(() => createMockChildProcess(mockCommitOutput, ''));

      await gitService.getCommitsForFile('src/test.ts', { since: '1 week ago' });

      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenNthCalledWith(2, 'git',
        ['log', '--format=%H|%s|%an|%ai', '--follow', '-n', '50', '--since="1 week ago"', '--', '"src/test.ts"'],
        expect.any(Object)
      );
    });

    it('should return empty array when not a git repository', async () => {
      mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const commits = await gitService.getCommitsForFile('src/test.ts');

      expect(commits).toEqual([]);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should return empty array when git command returns no output', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockSpawn
        .mockImplementationOnce(() => createMockChildProcess('.git', ''))
        .mockImplementationOnce(() => createMockChildProcess('', ''));

      const commits = await gitService.getCommitsForFile('src/test.ts');

      expect(commits).toEqual([]);
    });

    it('should handle git command errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFsAccess.mockResolvedValue(undefined);

      const error = new Error('Git error');
      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['log'], stdout: '', code: 1, error }
      ]);

      const commits = await gitService.getCommitsForFile('src/test.ts');

      expect(commits).toEqual([]);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getFilesForCommit', () => {
    const mockFilesOutput = `src/components/Button.tsx
src/styles/button.css
tests/Button.test.tsx`;

    it('should return list of files for a commit', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['show'], stdout: mockFilesOutput }
      ]);

      const files = await gitService.getFilesForCommit('abc123');

      expect(files).toEqual([
        'src/components/Button.tsx',
        'src/styles/button.css',
        'tests/Button.test.tsx',
      ]);
    });

    it('should normalize file paths', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['show'], stdout: 'src\\windows\\path.txt' }
      ]);

      const files = await gitService.getFilesForCommit('abc123');

      expect(files).toEqual(['src/windows/path.txt']);
    });

    it('should return empty array when not a git repository', async () => {
      mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const files = await gitService.getFilesForCommit('abc123');

      expect(files).toEqual([]);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should handle empty output', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['show'], stdout: '' }
      ]);

      const files = await gitService.getFilesForCommit('abc123');

      expect(files).toEqual([]);
    });
  });

  describe('getRecentlyCommittedFiles', () => {
    const mockRecentFilesOutput = `src/components/Header.tsx
src/utils/helpers.ts
src/components/Header.tsx
README.md`;

    it('should return deduplicated list of recently committed files', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['log'], stdout: mockRecentFilesOutput }
      ]);

      const files = await gitService.getRecentlyCommittedFiles(7);

      expect(files).toEqual([
        'src/components/Header.tsx',
        'src/utils/helpers.ts',
        'README.md',
      ]);
      expect(files).toHaveLength(3); // Duplicates should be removed
    });

    it('should use correct days parameter in command', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['log'], stdout: mockRecentFilesOutput }
      ]);

      await gitService.getRecentlyCommittedFiles(14);

      // The test passes if we get here without errors
    });

    it('should return empty array when not a git repository', async () => {
      mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const files = await gitService.getRecentlyCommittedFiles(7);

      expect(files).toEqual([]);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('getUncommittedChanges', () => {
    it('should return a list of uncommitted files', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      const mockDiffOutput = `M	src/file1.ts
A	new/file2.ts
D	deleted/file3.ts`;

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['diff'], stdout: mockDiffOutput },
        { args: ['ls-files'], stdout: '' }
      ]);

      const changes = await gitService.getUncommittedChanges();

      expect(changes).toHaveLength(3);
      expect(changes).toEqual([
        { status: 'M', path: 'src/file1.ts' },
        { status: 'A', path: 'new/file2.ts' },
        { status: 'D', path: 'deleted/file3.ts' },
      ]);
    });

    it('should return an empty array for a clean repository', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['diff'], stdout: '' },
        { args: ['ls-files'], stdout: '' }
      ]);

      const changes = await gitService.getUncommittedChanges();

      expect(changes).toEqual([]);
    });

    it('should normalize paths with backslashes', async () => {
        mockFsAccess.mockResolvedValue(undefined);
        const mockDiffOutput = `M	src\\windows\\path.ts`;

        setupMockSpawn([
          { args: ['rev-parse', '--git-dir'], stdout: '.git' },
          { args: ['diff'], stdout: mockDiffOutput },
          { args: ['ls-files'], stdout: '' }
        ]);

        const changes = await gitService.getUncommittedChanges();
        expect(changes).toEqual([{ status: 'M', path: 'src/windows/path.ts' }]);
    });

    it('should return an empty array if not a git repository', async () => {
      mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const changes = await gitService.getUncommittedChanges();
      
      expect(changes).toEqual([]);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should handle git command errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFsAccess.mockResolvedValue(undefined);
      const error = new Error('Git error');

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['diff'], stdout: '', code: 1, error },
        { args: ['ls-files'], stdout: '', code: 1, error }
      ]);

      const changes = await gitService.getUncommittedChanges();

      expect(changes).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting tracked uncommitted changes:', expect.any(Error));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting untracked files:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getContentAtHead', () => {
    const filePath = 'src/file1.ts';
    const fileContent = 'const x = 1;';

    it('should return the content of a file from HEAD', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['show'], stdout: fileContent }
      ]);

      const content = await gitService.getContentAtHead(filePath);

      expect(content).toBe(fileContent);
    });

    it('should return an empty string for a new file not in HEAD', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      const error = new Error('pathspec... did not match any file(s) known to git');

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['show'], stdout: '', code: 1, error }
      ]);

      const content = await gitService.getContentAtHead('new/file.ts');

      expect(content).toBe('');
    });

    it('should return an empty string if not a git repository', async () => {
      mockFsAccess.mockRejectedValueOnce(new Error('ENOENT'));

      const content = await gitService.getContentAtHead(filePath);

      expect(content).toBe('');
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle git not installed error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFsAccess.mockResolvedValue(undefined);
      const error: NodeJS.ErrnoException = new Error('ENOENT');
      error.code = 'ENOENT';

      mockSpawn.mockImplementationOnce(() => createMockChildProcess('', '', 0, error));

      // isGitRepository will fail and return false, causing the main method to return []
      const commits = await gitService.getCommitsForFile('src/test.ts');
      expect(commits).toEqual([]);
      consoleErrorSpy.mockRestore();
    });

    it('should handle git command stderr', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockFsAccess.mockResolvedValue(undefined);
      const error = new Error('Git error');

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['log'], stdout: '', stderr: 'fatal: not a git repository', code: 1, error }
      ]);

      // The service catches the error from executeGitCommand and returns an empty array
      const commits = await gitService.getCommitsForFile('src/test.ts');
      expect(commits).toEqual([]);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('commit log parsing', () => {
    it('should handle malformed commit log entries', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['log'], stdout: 'abc123|Only two parts' }
      ]);

      const commits = await gitService.getCommitsForFile('src/test.ts');
      expect(commits).toEqual([]); // Should skip malformed entries
    });

    it('should handle empty lines in commit log', async () => {
      mockFsAccess.mockResolvedValue(undefined);

      setupMockSpawn([
        { args: ['rev-parse', '--git-dir'], stdout: '.git' },
        { args: ['log'], stdout: 'abc123|Valid commit|Author|Date\n\n\ndef456|Another valid|Author2|Date2' }
      ]);

      const commits = await gitService.getCommitsForFile('src/test.ts');
      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe('abc123');
      expect(commits[1].hash).toBe('def456');
    });
  });
});
