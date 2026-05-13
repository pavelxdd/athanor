import React, { useState, useEffect } from 'react';
import {
  File,
  FileText,
  FolderOpen,
  RefreshCw,
  ClipboardCopy,
  Network,
  GitCompare,
} from 'lucide-react';
import { useLogStore, LogEntry } from '../stores/logStore';
import FileExplorer from './fileExplorer/FileExplorer';
import ActionPanel from './ActionPanel';
import FileViewerPanel from './FileViewerPanel';
import ReviewPanel from './ReviewPanel';
import SettingsPanel from './SettingsPanel';
import AthanorTabs, { TabType } from './AthanorTabs';
import { useFileSystemStore } from '../stores/fileSystemStore';
import { useApplyChangesStore } from '../stores/applyChangesStore';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { type FileOperationType } from '../types/global';
import { FileItem } from '../utils/fileTree';
import { usePanelResize } from '../hooks/usePanelResize';
import { useLogPanelResize } from '../hooks/useLogPanelResize';
import { copySelectedFilesContent } from '../actions/ManualCopyAction';
import { calculateSelectionTotals } from '../utils/fileSelection';

const EMPTY_SELECTED_FILES: string[] = [];

interface MainLayoutProps {
  filesData: FileItem;
  materialsData: FileItem | null;
  currentDirectory: string;
  appVersion: string;
  isRefreshing: boolean;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenFolder: () => Promise<void>;
  onRefresh: () => Promise<void>;
  logsRef: React.RefObject<HTMLDivElement | null>;
  logs: LogEntry[];
}

const MainLayout: React.FC<MainLayoutProps> = ({
  filesData,
  materialsData,
  currentDirectory,
  appVersion,
  isRefreshing,
  activeTab,
  onTabChange,
  onOpenFolder,
  onRefresh,
  logsRef,
  logs,
}) => {
  const { leftPanelWidth, resizeRef, startResize } = usePanelResize();
  const {
    logPanelHeight,
    resizeRef: logResizeRef,
    startResize: startLogResize,
  } = useLogPanelResize();

  const { effectiveConfig, fileTree, isGraphAnalysisInProgress } = useFileSystemStore();
  const { tabs, activeTabIndex } = useWorkbenchStore();

  // Calculate selection metrics from active workbench tab
  const activeWorkbenchTab = tabs[activeTabIndex];
  const selectedFiles = activeWorkbenchTab?.selectedFiles ?? EMPTY_SELECTED_FILES;
  const selectedFileCount = selectedFiles.length;
  // We'll calculate the line count asynchronously and update as needed
  const [selectedLinesTotal, setSelectedLinesTotal] = useState(0);

  // Update selected lines total when selected files change
  useEffect(() => {
    const updateLineCount = async () => {
      const count = await calculateSelectionTotals(selectedFiles, fileTree);
      setSelectedLinesTotal(count);
    };
    void updateLineCount();
  }, [selectedFiles, fileTree]);

  const handleFileView = () => {
    onTabChange('viewer');
  };

  const { addLog } = useLogStore();
  const { setOperations, clearOperations } = useApplyChangesStore();
  const [isLoadingDiffs, setIsLoadingDiffs] = useState(false);
  const [isGitAvailable, setIsGitAvailable] = useState(false);

  useEffect(() => {
    if (!currentDirectory) {
      setIsGitAvailable(false);
      return;
    }

    const checkGitStatus = async () => {
      try {
        const isRepo = await window.electronBridge.git.isGitRepository();
        setIsGitAvailable(isRepo);
      } catch (error) {
        console.error('Failed to check git status:', error);
        addLog(
          'Could not check Git status. Git might not be installed or configured correctly in your PATH.'
        );
        setIsGitAvailable(false);
      }
    };

    void checkGitStatus();
  }, [currentDirectory, addLog]);

  const handleCopySelectedFiles = async () => {
    await copySelectedFilesContent({
      addLog,
      rootPath: currentDirectory,
    });
  };

  const handleViewGitDiffs = async () => {
    setIsLoadingDiffs(true);
    addLog('Fetching uncommitted Git changes...');
    try {
      const diffData = await window.electronBridge.git.viewDiffs();

      if (!diffData || diffData.length === 0) {
        addLog('No uncommitted changes found.');
        return;
      }

      addLog(`Found ${diffData.length} uncommitted change(s).`);

      const operations = diffData.map((diff) => {
        let operationType: FileOperationType;
        switch (diff.status) {
          case 'A':
            operationType = 'CREATE';
            break;
          case 'D':
            operationType = 'DELETE';
            break;
          case 'M':
          default:
            operationType = 'UPDATE_FULL';
            break;
        }
        return {
          file_path: diff.path,
          file_operation: operationType,
          old_code: diff.oldCode,
          new_code: diff.newCode,
          file_message: `Uncommitted change. Status: ${
            diff.status === 'A' ? 'Added' : diff.status === 'D' ? 'Deleted' : 'Modified'
          }`,
          accepted: false,
          rejected: false,
        };
      });

      clearOperations();
      setOperations(operations, 'git');

      onTabChange('review');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error fetching Git diffs:', errorMessage);
      addLog(`Error fetching Git diffs: ${errorMessage}`);
    } finally {
      setIsLoadingDiffs(false);
    }
  };

  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      {/* Left Panel - File Explorer */}
      <div
        style={{ width: leftPanelWidth }}
        className="flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 h-full"
      >
        {/* Fixed top section */}
        <div className="p-4 flex-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={onOpenFolder}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                title="Open folder"
              >
                <FolderOpen size={20} className="text-gray-600 dark:text-gray-300" />
              </button>
              <button
                onClick={() => onRefresh()}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                disabled={isRefreshing || !currentDirectory}
                title="Refresh file system"
              >
                <RefreshCw
                  size={20}
                  className={`${
                    isRefreshing || !currentDirectory
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-600 dark:text-gray-300'
                  } ${isRefreshing ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                onClick={() => window.electronBridge.graph.forceReanalyze()}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                disabled={isGraphAnalysisInProgress || !currentDirectory}
                title="Refresh project analysis"
              >
                <Network
                  size={20}
                  className={`${
                    isGraphAnalysisInProgress || !currentDirectory
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-600 dark:text-gray-300'
                  } ${isGraphAnalysisInProgress ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                onClick={handleViewGitDiffs}
                disabled={isLoadingDiffs || !currentDirectory || !isGitAvailable}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                title={
                  !currentDirectory
                    ? 'Open a project to view git changes'
                    : isGitAvailable
                      ? 'View uncommitted changes'
                      : 'Not a Git repository or Git is not available'
                }
              >
                <GitCompare
                  size={20}
                  className={`${
                    isLoadingDiffs
                      ? 'animate-spin'
                      : !isGitAvailable || !currentDirectory
                        ? 'text-gray-400 dark:text-gray-500'
                        : 'text-gray-600 dark:text-gray-300'
                  }`}
                />
              </button>
              <button
                onClick={handleCopySelectedFiles}
                disabled={selectedFileCount === 0 || !currentDirectory}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                title="Copy selected files"
              >
                <ClipboardCopy
                  size={20}
                  className={`${
                    selectedFileCount === 0 || !currentDirectory
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                />
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-0">
            <div className="font-medium">{effectiveConfig?.project_name || 'Loading...'}</div>
            <div
              className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate min-w-0"
              style={{ direction: 'rtl', textAlign: 'left' }}
              title={currentDirectory}
            >
              {currentDirectory}
            </div>
          </div>
        </div>

        {/* Scrollable file explorer section */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4">
          <FileExplorer
            items={[filesData, ...(materialsData ? [materialsData] : [])]}
            onViewFile={handleFileView}
            onRefresh={onRefresh}
          />
        </div>

        {/* Fixed bottom section */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 flex items-center justify-between flex-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1" title="Number of selected files">
              <File size={14} className="text-gray-600 dark:text-gray-300" />
              <span>{selectedFileCount}</span>
            </div>
            <div className="flex items-center gap-1" title="Total lines across selected files">
              <FileText size={14} className="text-gray-600 dark:text-gray-300" />
              <span>{selectedLinesTotal}</span>
            </div>
          </div>
          <div className="text-gray-500 dark:text-gray-400" title="Athanor application version">
            {appVersion}
          </div>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        ref={resizeRef}
        className="w-1 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-400 active:bg-blue-700 dark:active:bg-blue-600"
        onMouseDown={startResize}
      />

      {/* Right Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top panel: tabs */}
        <AthanorTabs activeTab={activeTab} onTabChange={onTabChange} />

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 min-w-0">
          <div style={{ display: activeTab === 'workbench' ? 'block' : 'none', height: '100%' }}>
            <ActionPanel
              rootItems={materialsData ? [filesData, materialsData] : [filesData]}
              setActivePanelTab={onTabChange}
              isActive={activeTab === 'workbench'}
            />
          </div>
          <div style={{ display: activeTab === 'viewer' ? 'block' : 'none', height: '100%' }}>
            <FileViewerPanel onTabChange={onTabChange} />
          </div>
          <div style={{ display: activeTab === 'review' ? 'block' : 'none', height: '100%' }}>
            <ReviewPanel />
          </div>
          <div style={{ display: activeTab === 'settings' ? 'block' : 'none', height: '100%' }}>
            <SettingsPanel />
          </div>
        </div>

        {/* Log panel resize handle */}
        <div
          ref={logResizeRef}
          className="h-1 cursor-ns-resize bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 dark:hover:bg-blue-400 active:bg-blue-700 dark:active:bg-blue-600"
          onMouseDown={startLogResize}
        />

        {/* Bottom panel: logs */}
        <div
          ref={logsRef}
          style={{ height: logPanelHeight }}
          className="border-t border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800 overflow-y-auto font-mono text-sm"
        >
          {logs.map((log) => {
            const isError = log.level === 'error';
            const baseTextColor = isError
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-700 dark:text-gray-300';

            return (
              <div key={log.id} className={baseTextColor}>
                {log.onClick ? (
                  <button
                    onClick={log.onClick}
                    className={`text-left hover:underline transition-colors ${
                      isError
                        ? '' // Inherit red color from parent
                        : 'text-purple-600 dark:text-purple-400'
                    }`}
                  >
                    <span>[{log.timestamp}] </span>
                    <span>{log.message}</span>
                  </button>
                ) : (
                  <span>
                    <span>[{log.timestamp}] </span>
                    <span>{log.message}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
