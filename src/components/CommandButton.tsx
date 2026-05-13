import React from 'react';
import { Hammer } from 'lucide-react';
import { processAiResponseContent } from '../actions/ApplyAiOutputAction';
import { useLogStore } from '../stores/logStore';
import type { FileOperation } from '../types/global';

interface CommandButtonProps {
  setOperations: (ops: FileOperation[]) => void;
  clearOperations: () => void;
  setActiveTab?: (tab: 'workbench' | 'viewer' | 'review') => void;
}

const CommandButton: React.FC<CommandButtonProps> = ({
  setOperations,
  clearOperations,
  setActiveTab,
}) => {
  const { addLog } = useLogStore();

  const handleApplyClick = async () => {
    addLog('Reading clipboard for AI commands...');
    try {
      const clipboardContent = await navigator.clipboard.readText();
      if (!clipboardContent || clipboardContent.trim() === '') {
        addLog('Clipboard is empty.');
        return;
      }
      await processAiResponseContent(clipboardContent, {
        addLog,
        setOperations,
        clearOperations,
        setActiveTab,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to read or process clipboard content:', error);
      addLog(`Error: ${errorMessage}`);
    }
  };

  return (
    <button
      className="px-4 py-2 bg-green-500 text-white rounded flex items-center ml-4 hover:bg-green-600"
      onClick={handleApplyClick}
      title="Parse clipboard and apply AI commands"
    >
      <Hammer className="w-4 h-4 mr-2" />
      Apply AI Output
    </button>
  );
};

export default CommandButton;
