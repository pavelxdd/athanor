/**
 * @jest-environment jsdom
 */
import { processAiResponseContent } from './ApplyAiOutputAction';
import * as commands from '../commands';
import { FileOperation } from '../types/global';

// Mock the commands module
jest.mock('../commands', () => ({
  parseCommand: jest.fn(),
  executeSelectCommand: jest.fn(),
  executeTaskCommand: jest.fn(),
  executeApplyChangesCommand: jest.fn(),
  executeAgentTaskCommand: jest.fn(),
  COMMAND_TYPES: {
    SELECT: 'select',
    TASK: 'task',
    APPLY_CHANGES: 'apply changes',
    AGENT_TASK: 'agent task',
  },
}));

// Mock the applyChangesStore
jest.mock('../stores/applyChangesStore', () => ({
  useApplyChangesStore: {
    getState: jest.fn(),
  },
}));

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    readText: jest.fn(),
  },
  writable: true,
});

// Mock console.error to avoid noise in test output
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('ApplyAiOutputAction', () => {
  let mockAddLog: jest.Mock;
  let mockSetOperations: jest.Mock;
  let mockClearOperations: jest.Mock;
  let mockSetActiveTab: jest.Mock;
  let mockParams: {
    addLog: jest.Mock;
    setOperations: jest.Mock;
    clearOperations: jest.Mock;
    setActiveTab?: jest.Mock;
  };

  const mockOperation: FileOperation = {
    file_path: 'test.ts',
    file_operation: 'UPDATE_FULL',
    new_code: 'new code',
    old_code: 'old code',
    file_message: 'test message',
    accepted: false,
    rejected: false,
  };

  beforeEach(() => {
    mockAddLog = jest.fn();
    mockSetOperations = jest.fn();
    mockClearOperations = jest.fn();
    mockSetActiveTab = jest.fn();
    mockParams = {
      addLog: mockAddLog,
      setOperations: mockSetOperations,
      clearOperations: mockClearOperations,
      setActiveTab: mockSetActiveTab,
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Set default mock return values
    (commands.executeSelectCommand as jest.Mock).mockResolvedValue(true);
    (commands.executeTaskCommand as jest.Mock).mockResolvedValue(true);
    (commands.executeAgentTaskCommand as jest.Mock).mockResolvedValue(true);
    (commands.executeApplyChangesCommand as jest.Mock).mockResolvedValue(true);
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('processAiResponseContent', () => {
    it('should log message when no valid commands are found', async () => {
      (commands.parseCommand as jest.Mock).mockReturnValue(null);

      await processAiResponseContent('some content', mockParams);

      expect(mockAddLog).toHaveBeenCalledWith('No valid commands found in AI response');
      expect(commands.executeSelectCommand).not.toHaveBeenCalled();
      expect(commands.executeTaskCommand).not.toHaveBeenCalled();
      expect(commands.executeApplyChangesCommand).not.toHaveBeenCalled();
    });

    it('should handle empty commands array', async () => {
      (commands.parseCommand as jest.Mock).mockReturnValue([]);

      await processAiResponseContent('some content', mockParams);

      expect(mockAddLog).toHaveBeenCalledWith('No valid commands found in AI response');
    });

    it('should execute SELECT command successfully', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.SELECT,
        content: 'file1.ts file2.ts',
      };
      (commands.parseCommand as jest.Mock).mockReturnValue([mockCommand]);
      (commands.executeSelectCommand as jest.Mock).mockResolvedValue(true);

      await processAiResponseContent('ai content', mockParams);

      expect(commands.executeSelectCommand).toHaveBeenCalledWith({
        content: 'file1.ts file2.ts',
        addLog: mockAddLog,
      });
      expect(mockAddLog).not.toHaveBeenCalledWith(expect.stringContaining('Failed to execute'));
    });

    it('should handle SELECT command failure', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.SELECT,
        content: 'file1.ts',
      };
      (commands.parseCommand as jest.Mock).mockReturnValue([mockCommand]);
      (commands.executeSelectCommand as jest.Mock).mockResolvedValue(false);

      await processAiResponseContent('ai content', mockParams);

      expect(commands.executeSelectCommand).toHaveBeenCalled();
      expect(mockAddLog).toHaveBeenCalledWith('Failed to execute select command');
    });

    it('should execute TASK command successfully', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.TASK,
        content: 'Update the documentation',
      };
      (commands.parseCommand as jest.Mock).mockReturnValue([mockCommand]);
      (commands.executeTaskCommand as jest.Mock).mockResolvedValue(true);

      await processAiResponseContent('ai content', mockParams);

      expect(commands.executeTaskCommand).toHaveBeenCalledWith({
        content: 'Update the documentation',
        addLog: mockAddLog,
      });
      expect(mockAddLog).not.toHaveBeenCalledWith(expect.stringContaining('Failed to execute'));
    });

    it('should handle TASK command failure', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.TASK,
        content: 'task content',
      };
      (commands.parseCommand as jest.Mock).mockReturnValue([mockCommand]);
      (commands.executeTaskCommand as jest.Mock).mockResolvedValue(false);

      await processAiResponseContent('ai content', mockParams);

      expect(commands.executeTaskCommand).toHaveBeenCalled();
      expect(mockAddLog).toHaveBeenCalledWith('Failed to execute task command');
    });

    it('should execute a single APPLY_CHANGES command successfully', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.APPLY_CHANGES,
        content: [mockOperation],
      };
      (commands.parseCommand as jest.Mock).mockResolvedValue([mockCommand]);
      (commands.executeApplyChangesCommand as jest.Mock).mockResolvedValue(true);

      await processAiResponseContent('ai content', mockParams);

      expect(commands.executeApplyChangesCommand).toHaveBeenCalledWith({
        operations: [mockOperation],
        addLog: mockAddLog,
        setOperations: mockSetOperations,
        clearOperations: mockClearOperations,
        setActiveTab: mockSetActiveTab,
      });
      expect(mockAddLog).not.toHaveBeenCalledWith(expect.stringContaining('Failed to execute'));
    });

    it('should aggregate multiple APPLY_CHANGES commands into a single execution', async () => {
      const mockOp1 = { ...mockOperation, file_path: 'file1.ts' };
      const mockOp2 = { ...mockOperation, file_path: 'file2.ts' };
      const mockCommands = [
        {
          type: commands.COMMAND_TYPES.APPLY_CHANGES,
          content: [mockOp1],
        },
        {
          type: commands.COMMAND_TYPES.APPLY_CHANGES,
          content: [mockOp2],
        },
      ];
      (commands.parseCommand as jest.Mock).mockResolvedValue(mockCommands);

      await processAiResponseContent('ai content', mockParams);

      expect(commands.executeApplyChangesCommand).toHaveBeenCalledTimes(1);
      expect(commands.executeApplyChangesCommand).toHaveBeenCalledWith({
        operations: [mockOp1, mockOp2],
        addLog: mockAddLog,
        setOperations: mockSetOperations,
        clearOperations: mockClearOperations,
        setActiveTab: mockSetActiveTab,
      });
      expect(commands.executeSelectCommand).not.toHaveBeenCalled();
      expect(commands.executeTaskCommand).not.toHaveBeenCalled();
    });

    it('should process a mix of APPLY_CHANGES and other commands correctly', async () => {
      const mockOp1 = { ...mockOperation, file_path: 'file1.ts' };
      const mockOp2 = { ...mockOperation, file_path: 'file2.ts' };
      const mockCommands = [
        { type: commands.COMMAND_TYPES.SELECT, content: 'select content' },
        {
          type: commands.COMMAND_TYPES.APPLY_CHANGES,
          content: [mockOp1],
        },
        { type: commands.COMMAND_TYPES.TASK, content: 'task content' },
        {
          type: commands.COMMAND_TYPES.APPLY_CHANGES,
          content: [mockOp2],
        },
      ];
      (commands.parseCommand as jest.Mock).mockResolvedValue(mockCommands);

      await processAiResponseContent('ai content', mockParams);

      // Verify aggregated APPLY_CHANGES call
      expect(commands.executeApplyChangesCommand).toHaveBeenCalledTimes(1);
      expect(commands.executeApplyChangesCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: [mockOp1, mockOp2],
        })
      );

      // Verify other command calls
      expect(commands.executeSelectCommand).toHaveBeenCalledTimes(1);
      expect(commands.executeSelectCommand).toHaveBeenCalledWith({
        content: 'select content',
        addLog: mockAddLog,
      });

      expect(commands.executeTaskCommand).toHaveBeenCalledTimes(1);
      expect(commands.executeTaskCommand).toHaveBeenCalledWith({
        content: 'task content',
        addLog: mockAddLog,
      });
    });

    it('should handle APPLY_CHANGES command failure', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.APPLY_CHANGES,
        content: [mockOperation],
      };
      (commands.parseCommand as jest.Mock).mockResolvedValue([mockCommand]);
      (commands.executeApplyChangesCommand as jest.Mock).mockResolvedValue(false);

      await processAiResponseContent('ai content', mockParams);

      expect(commands.executeApplyChangesCommand).toHaveBeenCalled();
      expect(mockAddLog).toHaveBeenCalledWith('Failed to execute combined APPLY_CHANGES command');
    });

    it('should handle unknown command type', async () => {
      const mockCommand = {
        type: 'UNKNOWN_COMMAND',
        content: 'some content',
      };
      (commands.parseCommand as jest.Mock).mockReturnValue([mockCommand]);

      await processAiResponseContent('ai content', mockParams);

      expect(mockAddLog).toHaveBeenCalledWith('Unknown command type: UNKNOWN_COMMAND');
      expect(commands.executeSelectCommand).not.toHaveBeenCalled();
      expect(commands.executeTaskCommand).not.toHaveBeenCalled();
      expect(commands.executeApplyChangesCommand).not.toHaveBeenCalled();
    });

    it('should handle error during command parsing', async () => {
      const parseError = new Error('Parse error');
      (commands.parseCommand as jest.Mock).mockRejectedValue(parseError);

      await processAiResponseContent('ai content', mockParams);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to process AI content:', parseError);
      expect(mockAddLog).toHaveBeenCalledWith('Failed to process AI content: Parse error');
    });

    it('should handle error thrown by command execution', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.SELECT,
        content: 'select content',
      };
      (commands.parseCommand as jest.Mock).mockReturnValue([mockCommand]);
      const executionError = new Error('Execution error');
      (commands.executeSelectCommand as jest.Mock).mockImplementation(() => {
        throw executionError;
      });

      await processAiResponseContent('ai content', mockParams);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to process AI content:', executionError);
      expect(mockAddLog).toHaveBeenCalledWith('Failed to process AI content: Execution error');
    });

    it('should handle params without setActiveTab', async () => {
      const paramsWithoutSetActiveTab = {
        addLog: mockAddLog,
        setOperations: mockSetOperations,
        clearOperations: mockClearOperations,
      };
      const mockCommand = {
        type: commands.COMMAND_TYPES.APPLY_CHANGES,
        content: [mockOperation],
      };
      (commands.parseCommand as jest.Mock).mockResolvedValue([mockCommand]);

      await processAiResponseContent('ai content', paramsWithoutSetActiveTab);

      expect(commands.executeApplyChangesCommand).toHaveBeenCalledWith({
        operations: [mockOperation],
        addLog: mockAddLog,
        setOperations: mockSetOperations,
        clearOperations: mockClearOperations,
        setActiveTab: undefined,
      });
    });

    it('should handle non-Error objects thrown during execution', async () => {
      const mockCommand = {
        type: commands.COMMAND_TYPES.SELECT,
        content: 'select content',
      };
      (commands.parseCommand as jest.Mock).mockReturnValue([mockCommand]);
      (commands.executeSelectCommand as jest.Mock).mockRejectedValue('String error');

      await processAiResponseContent('ai content', mockParams);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to process AI content:', 'String error');
      expect(mockAddLog).toHaveBeenCalledWith('Failed to process AI content: String error');
    });
  });
});
