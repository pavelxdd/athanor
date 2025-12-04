import React, { useState, useEffect, useRef } from 'react';
import { createPatch } from 'diff';
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsDownUp,
  ChevronsUp,
  ChevronsUpDown,
  ChevronUp,
  Pen,
  GitCompare,
  Wrench,
  X,
} from 'lucide-react';
import { useApplyChangesStore } from '../stores/applyChangesStore';
import { useFileSystemStore } from '../stores/fileSystemStore';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useLogStore } from '../stores/logStore';
import { SETTINGS } from '../utils/constants';

const DIFF_MERGE_THRESHOLD = 2; // Diffs separated by 2 or fewer context lines are merged
const CONTEXT_LINES_COMPACT = 5; // Lines of context for compact diff view

interface DiffBlock {
  start: number;
  end: number;
}

interface DiffLineProps {
  content: string;
  type: 'add' | 'remove' | 'context' | 'header';
  oldLineNum?: number;
  newLineNum?: number;
}

const DiffLine: React.FC<DiffLineProps> = ({ content, type, oldLineNum, newLineNum }) => {
  const baseClass = 'font-mono text-xs leading-5 whitespace-pre flex';
  let lineClass = baseClass;
  let prefix = ' ';

  const oldNumStr = oldLineNum?.toString().padStart(4, ' ') || '    ';
  const newNumStr = newLineNum?.toString().padStart(4, ' ') || '    ';
  
  const numClass = 'select-none inline-block w-10 text-right opacity-50 pr-2';
  const contentClass = 'pl-1 flex-1'; // Use flex-1 to fill remaining space

  switch (type) {
    case 'add':
      lineClass += ' bg-green-100 dark:bg-blue-900/30 text-green-900 dark:text-blue-100';
      prefix = '+';
      break;
    case 'remove':
      lineClass += ' bg-red-100 dark:bg-orange-900/30 text-red-900 dark:text-orange-100';
      prefix = '-';
      break;
    case 'header':
      lineClass += ' bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 font-semibold';
      return (
        <div className={lineClass}>
          <span className={`${numClass} opacity-100`}>...</span>
          <span className={`${numClass} opacity-100 border-l border-blue-300 dark:border-blue-700`}>...</span>
          {/* content now holds the full "@@ ... @@" string, so we don't need a separate prefix */}
          <span className={`${contentClass} opacity-70 pl-5`}>{content}</span>
        </div>
      );
    default: // context
      lineClass += ' text-gray-700 dark:text-gray-300';
      prefix = ' ';
  }

  return (
    <div className={lineClass}>
      <span className={`${numClass} border-r border-gray-200 dark:border-gray-700`}>
        {type === 'add' ? '' : oldNumStr}
      </span>
      <span className={`${numClass} border-r border-gray-200 dark:border-gray-700`}>
        {type === 'remove' ? '' : newNumStr}
      </span>
      <span className="select-none w-4 inline-block text-center">{prefix}</span>
      <span className={contentClass}>{content}</span>
    </div>
  );
};

const calculateMergedDiffBlocks = (lines: string[]): DiffBlock[] => {
  if (!lines || lines.length === 0) {
    return [];
  }

  // Step 1: Find all individual change hunks
  const hunks: DiffBlock[] = [];
  let inHunk = false;
  let currentHunk: DiffBlock = { start: -1, end: -1 };

  lines.forEach((line, index) => {
    const isDiffLine = line.startsWith('+') || line.startsWith('-');

    if (isDiffLine && !inHunk) {
      inHunk = true;
      currentHunk = { start: index, end: index };
    } else if (isDiffLine && inHunk) {
      currentHunk.end = index;
    } else if (!isDiffLine && inHunk) {
      inHunk = false;
      hunks.push(currentHunk);
    }
  });

  if (inHunk) {
    hunks.push(currentHunk); // Add the last hunk if the file ends with a diff
  }

  if (hunks.length === 0) {
    return [];
  }

  // Step 2: Merge hunks that are close to each other
  const mergedBlocks: DiffBlock[] = [hunks[0]];

  for (let i = 1; i < hunks.length; i++) {
    const prevBlock = mergedBlocks[mergedBlocks.length - 1];
    const currentHunk = hunks[i];

    const linesBetween = currentHunk.start - prevBlock.end - 1;

    if (linesBetween <= DIFF_MERGE_THRESHOLD) {
      // Merge with the previous block
      prevBlock.end = currentHunk.end;
    } else {
      // Start a new block
      mergedBlocks.push(currentHunk);
    }
  }

  return mergedBlocks;
};

const DiffView: React.FC<{
  oldText: string;
  newText: string;
  filePath: string;
  isCompact: boolean;
  onDiffBlocksCalculated?: (blocks: DiffBlock[]) => void;
  diffViewRef?: React.RefObject<HTMLDivElement>;
}> = ({
  oldText,
  newText,
  filePath,
  isCompact,
  onDiffBlocksCalculated,
  diffViewRef,
}) => {
  // Only normalize line endings for comparison
  const normalizeForComparison = (text: string) => {
    if (!text) return '';
    let content = text
      .replace(/\r\n/g, '\n') // Normalize Windows line endings
      .replace(/\r/g, '\n'); // Normalize old Mac line endings

    // Match FileService.ts write logic: ensure a final newline if content exists
    if (content.length > 0 && !content.endsWith('\n')) {
      content += '\n';
    }
    return content;
  };

  const normalizedOld = normalizeForComparison(oldText);
  const normalizedNew = normalizeForComparison(newText);

  if (normalizedOld === normalizedNew) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400 italic">
        No changes (files are identical after normalizing line endings)
      </div>
    );
  }

  // Create diff with context
  const patch = createPatch(filePath, normalizedOld, normalizedNew, '', '', {
    context: isCompact ? CONTEXT_LINES_COMPACT : 999999,
  });

  const lines = patch.split('\n').slice(2); // Skip the diff header

  // Calculate diff blocks (consecutive sequences of +/- lines)
  useEffect(() => {
    if (onDiffBlocksCalculated) {
      const mergedBlocks = calculateMergedDiffBlocks(lines);
      onDiffBlocksCalculated(mergedBlocks);
    }
  }, [lines, onDiffBlocksCalculated]);

  // Use useMemo to create the rendered lines array, tracking line numbers
  const renderedLines = React.useMemo(() => {
    let currentOldLineNum = 0;
    let currentNewLineNum = 0;
    const hunkRegex = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/; // Capture content after header

    return lines.reduce<React.ReactNode[]>((acc, line, index) => {
      // Skip final empty line if it exists
      if (!line && index === lines.length - 1) return acc;

      const hunkMatch = line.match(hunkRegex);

      if (hunkMatch) {
        currentOldLineNum = parseInt(hunkMatch[1], 10);
        currentNewLineNum = parseInt(hunkMatch[2], 10);
        // Pass the *entire* line content
        acc.push(<DiffLine key={index} content={line} type="header" />);
      } else if (line.startsWith('+')) {
        acc.push(<DiffLine key={index} content={line.slice(1)} type="add" newLineNum={currentNewLineNum} />);
        currentNewLineNum++;
      } else if (line.startsWith('-')) {
        acc.push(<DiffLine key={index} content={line.slice(1)} type="remove" oldLineNum={currentOldLineNum} />);
        currentOldLineNum++;
      } else { // Context line
        acc.push(<DiffLine key={index} content={line.slice(1)} type="context" oldLineNum={currentOldLineNum} newLineNum={currentNewLineNum} />);
        currentOldLineNum++;
        currentNewLineNum++;
      }
      return acc;
    }, []);
  }, [lines]); // Recalculate only when lines change

  return (
    <div
      ref={diffViewRef}
      className="overflow-x-auto bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 p-2 min-w-0"
    >
      <div className="space-y-0 min-w-max">
        {renderedLines.map((lineNode, index) => (
          <div key={index} data-line-index={index}>
            {lineNode}
          </div>
        ))}
      </div>
    </div>
  );
};

interface FileOperationItemProps {
  operation: any;
  index: number;
  mode: 'ai' | 'git';
  onAccept: (idx: number) => void;
  onReject: (idx: number) => void;
  isActive?: boolean;
  onDiffBlocksCalculated?: (blocks: DiffBlock[]) => void;
  diffViewRef?: React.RefObject<HTMLDivElement>;
  isCompact: boolean;
  onToggleCompact: () => void;
}

const FileOperationItem = React.forwardRef<
  HTMLDivElement,
  FileOperationItemProps
>(
  (
    {
      operation: op,
      index,
      mode,
      onAccept,
      onReject,
      isActive = false,
      onDiffBlocksCalculated,
      diffViewRef,
      isCompact,
      onToggleCompact,
    },
    ref
  ) => {
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const { tabs, activeTabIndex } = useWorkbenchStore();
    const { applicationSettings } = useSettingsStore();
    const { addLog } = useLogStore();
    const { setOperationError } = useApplyChangesStore();

    useEffect(() => {
      // This effect generates the preview content or catches an error.
      // It's designed to avoid re-render loops by conditionally updating global state.
      let newPreviewContent: string | null = null;
      let newPreviewError: string | null = null;

      try {
        if (op.file_operation === 'APPEND') {
          newPreviewContent = op.old_code + op.new_code;
        } else if (op.file_operation === 'PREPEND') {
          newPreviewContent = op.new_code + op.old_code;
        } else if (
          op.file_operation === 'UPDATE_DIFF' &&
          op.diff_blocks &&
          op.diff_blocks.length > 0
        ) {
          const { processFileUpdate } = require('../utils/fileOperations');
          newPreviewContent = processFileUpdate(
            'UPDATE_DIFF',
            op.file_path,
            op.diff_blocks,
            op.old_code
          );
        } else {
          newPreviewContent = op.new_code;
        }
      } catch (e) {
        newPreviewError =
          e instanceof Error
            ? `Error generating diff preview: ${e.message}`
            : `An unknown error occurred while generating diff preview.`;
      }

      // Update local state for the UI
      setPreviewContent(newPreviewContent);
      setPreviewError(newPreviewError);

      // Conditionally update global state to avoid loops
      if (newPreviewError) {
        if (op.error !== newPreviewError) {
          setOperationError(index, newPreviewError);
        }
        addLog({
          message: `For file ${op.file_path}: ${newPreviewError}`,
          level: 'error',
        });
      } else {
        // If there was a global error before but now it's resolved, clear it.
        if (op.error) {
          setOperationError(index, null);
        }
      }
    }, [op, index, addLog, setOperationError]);

    return (
      <div
        ref={ref}
        className={`border rounded p-4 bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/20 flex flex-col transition-all ${
          isActive
            ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400'
            : 'border-gray-200 dark:border-gray-600'
        }`}
      >
        <div className="flex justify-between items-start mb-4 flex-shrink-0">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-start gap-2">
              <p className="font-semibold break-all text-gray-900 dark:text-gray-100">
                {op.file_path}
              </p>
            </div>
            {op.file_message && (
              <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
                {op.file_message}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={onToggleCompact}
              title={isCompact ? 'Expand (Show full file)' : 'Collapse (Show compact diff)'}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"
            >
              {isCompact ? <ChevronsDown size={16} /> : <ChevronsUp size={16} />}
            </button>
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${
                op.file_operation === 'CREATE'
                  ? 'bg-green-600'
                  : op.file_operation === 'DELETE'
                    ? 'bg-red-600'
                    : op.file_operation === 'APPEND' ||
                        op.file_operation === 'PREPEND'
                      ? 'bg-purple-600'
                      : 'bg-blue-600'
              }`}
            >
              {op.file_operation}
            </span>
          </div>
        </div>

        {op.warning && (
          <div className="flex items-start gap-2 p-3 my-2 text-sm rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{op.warning}</p>
          </div>
        )}

        <div className="min-w-0 w-full">
          {previewError ? (
            <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-200 rounded border border-red-200 dark:border-red-700 font-mono text-xs">
              {previewError}
            </div>
          ) : previewContent === null ? (
            <div className="p-4 text-gray-500 dark:text-gray-400 italic text-sm">
              Generating preview...
            </div>
          ) : (
            <DiffView
              oldText={op.old_code}
              newText={previewContent}
              filePath={op.file_path}
              isCompact={isCompact}
              onDiffBlocksCalculated={onDiffBlocksCalculated}
              diffViewRef={diffViewRef}
            />
          )}
        </div>

        {!previewError && (
          <div className="mt-4 flex justify-between items-center flex-shrink-0">
            <div className="flex gap-2">
              {mode === 'ai' && (
                <button
                  className="px-3 py-1 bg-green-500 dark:bg-green-600 text-white rounded hover:bg-green-600 dark:hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                  disabled={op.accepted || op.rejected || !!previewError}
                  onClick={() => onAccept(index)}
                >
                  Accept
                </button>
              )}
              <button
                className="px-3 py-1 bg-red-500 dark:bg-red-600 text-white rounded hover:bg-red-600 dark:hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                disabled={op.accepted || op.rejected || !!previewError}
                onClick={() => onReject(index)}
                title={
                  mode === 'git'
                    ? 'Revert change to the last commit'
                    : 'Reject change'
                }
              >
                {mode === 'git' ? 'Revert Change' : 'Reject'}
              </button>
            </div>

            {(op.accepted || op.rejected) && (
              <span
                className={`text-sm font-medium ${
                  op.accepted
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {op.accepted ? 'Changes Accepted' : 'Changes Rejected'}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

FileOperationItem.displayName = 'FileOperationItem';

const ReviewPanel: React.FC = () => {
  const { applicationSettings } = useSettingsStore();
  const defaultViewMode =
    applicationSettings?.diffViewMode || SETTINGS.defaults.application.diffViewMode;
  const [globalViewMode, setGlobalViewMode] = useState<'compact' | 'full'>(
    defaultViewMode
  );
  const [expandedFiles, setExpandedFiles] = useState(new Set<number>()); // Files user wants to see fully
  const [collapsedFiles, setCollapsedFiles] = useState(new Set<number>()); // Files user wants to see compactly

  const {
    activeOperations,
    mode,
    applyChange,
    rejectChange,
    applyAllChanges,
    rejectAllChanges,
    clearOperations,
  } = useApplyChangesStore();
  const { fileTree } = useFileSystemStore();
  const [currentIdx, setCurrentIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [currentDiffBlocks, setCurrentDiffBlocks] = useState<DiffBlock[]>([]);
  const [isPrevDiffDisabled, setIsPrevDiffDisabled] = useState(true);
  const [isNextDiffDisabled, setIsNextDiffDisabled] = useState(true);
  const diffViewRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const isManualNavigationRef = useRef(false);
  const manualNavigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasProject = fileTree.length > 0;

  const hasPendingOperations = activeOperations.some(
    (op) => !op.accepted && !op.rejected && !op.error
  );

  // Handle clear operations with confirmation for AI mode
  const handleClear = () => {
    const { addLog } = useLogStore.getState();

    if (mode === 'git') {
      // Git mode: clear immediately, no confirmation needed
      clearOperations();
      addLog('Cleared all changes');
      return;
    }

    // AI mode: check for pending operations
    if (hasPendingOperations) {
      const pendingCount = activeOperations.filter(
        (op) => !op.accepted && !op.rejected
      ).length;

      const confirmed = window.confirm(
        `There are ${pendingCount} pending change${pendingCount === 1 ? '' : 's'} that haven't been accepted or rejected.\n\nAre you sure you want to clear all changes? This action cannot be undone.`
      );

      if (!confirmed) {
        return;
      }
    }

    clearOperations();
    addLog('Cleared all changes');
  };

  // Navigation handlers
  const NAVIGATION_PADDING_ABOVE = 16; // Space above the target element when navigating

  const goTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goPrev = () => {
    const targetIdx = Math.max(0, currentIdx - 1);
    if (targetIdx === currentIdx) return; // Already at the beginning

    if (targetIdx >= 0 && targetIdx < itemRefs.current.length) {
      const element = itemRefs.current[targetIdx];
      if (element && containerRef.current && stickyHeaderRef.current) {
        // Disable scroll-based updates during manual navigation
        isManualNavigationRef.current = true;

        // Clear any existing timeout
        if (manualNavigationTimeoutRef.current) {
          clearTimeout(manualNavigationTimeoutRef.current);
        }

        // Get the sticky header height
        const headerHeight = stickyHeaderRef.current.offsetHeight;

        // Calculate the target scroll position
        // We want the top of the element to be NAVIGATION_PADDING_ABOVE pixels below the sticky header
        const elementTop = element.offsetTop;
        const targetScrollTop =
          elementTop - headerHeight - NAVIGATION_PADDING_ABOVE;
        const currentScrollTop = containerRef.current.scrollTop;

        // Update the current index immediately
        setCurrentIdx(targetIdx);

        // Check if we actually need to scroll
        if (Math.abs(targetScrollTop - currentScrollTop) < 2) {
          // Already at the target position, just re-enable scroll updates
          isManualNavigationRef.current = false;
          return;
        }

        // Set up scroll end detection
        let scrollEndTimer: NodeJS.Timeout | null = null;
        let hasScrolled = false;

        const onScroll = () => {
          hasScrolled = true;
          if (scrollEndTimer) clearTimeout(scrollEndTimer);
          scrollEndTimer = setTimeout(() => {
            // Re-enable scroll-based updates after scrolling stops
            isManualNavigationRef.current = false;
            containerRef.current?.removeEventListener('scroll', onScroll);
            if (scrollEndTimer) clearTimeout(scrollEndTimer);
          }, 150); // 150ms after last scroll event
        };

        // Add scroll listener before scrolling
        containerRef.current.addEventListener('scroll', onScroll, {
          passive: true,
        });

        // Force the scroll to happen
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth',
            });
          }
        });

        // Backup timeout in case scroll event detection fails
        manualNavigationTimeoutRef.current = setTimeout(() => {
          isManualNavigationRef.current = false;
          containerRef.current?.removeEventListener('scroll', onScroll);
          if (!hasScrolled && containerRef.current) {
            // Force scroll if it didn't happen
            containerRef.current.scrollTop = Math.max(0, targetScrollTop);
          }
        }, 1000); // 1 second backup timeout
      }
    }
  };

  const goNext = () => {
    const targetIdx = Math.min(activeOperations.length - 1, currentIdx + 1);
    if (targetIdx === currentIdx) return; // Already at the end

    if (targetIdx >= 0 && targetIdx < itemRefs.current.length) {
      const element = itemRefs.current[targetIdx];
      if (element && containerRef.current && stickyHeaderRef.current) {
        // Disable scroll-based updates during manual navigation
        isManualNavigationRef.current = true;

        // Clear any existing timeout
        if (manualNavigationTimeoutRef.current) {
          clearTimeout(manualNavigationTimeoutRef.current);
        }

        // Get the sticky header height
        const headerHeight = stickyHeaderRef.current.offsetHeight;

        // Calculate the target scroll position
        // We want the top of the element to be NAVIGATION_PADDING_ABOVE pixels below the sticky header
        const elementTop = element.offsetTop;
        const targetScrollTop =
          elementTop - headerHeight - NAVIGATION_PADDING_ABOVE;
        const currentScrollTop = containerRef.current.scrollTop;

        // Update the current index immediately
        setCurrentIdx(targetIdx);

        // Check if we actually need to scroll
        if (Math.abs(targetScrollTop - currentScrollTop) < 2) {
          // Already at the target position, just re-enable scroll updates
          isManualNavigationRef.current = false;
          return;
        }

        // Set up scroll end detection
        let scrollEndTimer: NodeJS.Timeout | null = null;
        let hasScrolled = false;

        const onScroll = () => {
          hasScrolled = true;
          if (scrollEndTimer) clearTimeout(scrollEndTimer);
          scrollEndTimer = setTimeout(() => {
            // Re-enable scroll-based updates after scrolling stops
            isManualNavigationRef.current = false;
            containerRef.current?.removeEventListener('scroll', onScroll);
            if (scrollEndTimer) clearTimeout(scrollEndTimer);
          }, 150); // 150ms after last scroll event
        };

        // Add scroll listener before scrolling
        containerRef.current.addEventListener('scroll', onScroll, {
          passive: true,
        });

        // Force the scroll to happen
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth',
            });
          }
        });

        // Backup timeout in case scroll event detection fails
        manualNavigationTimeoutRef.current = setTimeout(() => {
          isManualNavigationRef.current = false;
          containerRef.current?.removeEventListener('scroll', onScroll);
          if (!hasScrolled && containerRef.current) {
            // Force scroll if it didn't happen
            containerRef.current.scrollTop = Math.max(0, targetScrollTop);
          }
        }, 1000); // 1 second backup timeout
      }
    }
  };

  const goEnd = () => {
    // Scroll to the bottom of the current item
    if (currentIdx >= 0 && currentIdx < itemRefs.current.length) {
      const element = itemRefs.current[currentIdx];
      if (element && containerRef.current) {
        const elementBottom =
          element.offsetTop +
          element.offsetHeight -
          containerRef.current.clientHeight +
          100; // 100px padding
        containerRef.current.scrollTo({
          top: elementBottom,
          behavior: 'smooth',
        });
      }
    }
  };

  const goBottom = () => {
    // Scroll to the very bottom of the entire list
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const goPrevDiff = () => {
    if (currentIdx < 0 || currentIdx >= diffViewRefs.current.length) return;

    const diffViewRef = diffViewRefs.current[currentIdx];
    const diffView = diffViewRef?.current;
    const container = containerRef.current;
    if (!diffView || !container || currentDiffBlocks.length === 0) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const lineElements = diffView.querySelectorAll('[data-line-index]');
    let topLineIndex = -1;

    // Find the topmost visible line (with a small offset to be less sensitive)
    for (let i = 0; i < lineElements.length; i++) {
      const lineRect = lineElements[i].getBoundingClientRect();
      if (lineRect.top >= containerRect.top) {
        topLineIndex = parseInt(
          lineElements[i].getAttribute('data-line-index') || '-1'
        );
        break;
      }
    }

    // Find the last diff block whose start is before the current top line
    let targetBlock: DiffBlock | null = null;
    for (let i = currentDiffBlocks.length - 1; i >= 0; i--) {
      if (currentDiffBlocks[i].start < topLineIndex) {
        targetBlock = currentDiffBlocks[i];
        break;
      }
    }

    // Scroll to the target block if found
    if (targetBlock) {
      const targetElement = diffView.querySelector(
        `[data-line-index="${targetBlock.start}"]`
      );
      if (targetElement) {
        isManualNavigationRef.current = true;
        if (manualNavigationTimeoutRef.current) {
          clearTimeout(manualNavigationTimeoutRef.current);
        }

        let scrollEndTimer: NodeJS.Timeout | null = null;
        const onScroll = () => {
          if (scrollEndTimer) clearTimeout(scrollEndTimer);
          scrollEndTimer = setTimeout(() => {
            isManualNavigationRef.current = false;
            container.removeEventListener('scroll', onScroll);
          }, 150);
        };
        container.addEventListener('scroll', onScroll, { passive: true });

        const targetRect = targetElement.getBoundingClientRect();
        const scrollTop =
          container.scrollTop + targetRect.top - containerRect.top - 50; // 50px offset for better visibility;
        container.scrollTo({ top: scrollTop, behavior: 'smooth' });

        manualNavigationTimeoutRef.current = setTimeout(() => {
          isManualNavigationRef.current = false;
          container.removeEventListener('scroll', onScroll);
        }, 1000);
      }
    }
  };

  const goNextDiff = () => {
    if (currentIdx < 0 || currentIdx >= diffViewRefs.current.length) return;

    const diffViewRef = diffViewRefs.current[currentIdx];
    const diffView = diffViewRef?.current;
    const container = containerRef.current;
    if (!diffView || !container || currentDiffBlocks.length === 0) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const lineElements = diffView.querySelectorAll('[data-line-index]');
    let topLineIndex = -1;

    // Find the topmost visible line
    for (let i = 0; i < lineElements.length; i++) {
      const lineRect = lineElements[i].getBoundingClientRect();
      if (lineRect.top >= containerRect.top) {
        topLineIndex = parseInt(
          lineElements[i].getAttribute('data-line-index') || '-1'
        );
        break;
      }
    }

    // Determine whether we're effectively **inside** the current diff block.
    // Treat the few context lines that precede the first “+/-” line as part of
    // the block so that pressing “Next Diff” while they are visible still jumps
    // forward.  Adjust `DIFF_NAV_CONTEXT_LINES` if needed.
    const DIFF_NAV_CONTEXT_LINES = 3;
    let searchRefLine: number;
    const currentBlock = currentDiffBlocks.find(
      (b) =>
        topLineIndex >= b.start - DIFF_NAV_CONTEXT_LINES &&
        topLineIndex <= b.end
    );
    searchRefLine = currentBlock ? currentBlock.end : topLineIndex;

    // Find the first diff block that starts AFTER the reference line
    const targetBlock = currentDiffBlocks.find(
      (block) => block.start > searchRefLine
    );

    // Scroll to the target block if found
    if (targetBlock) {
      const targetElement = diffView.querySelector(
        `[data-line-index="${targetBlock.start}"]`
      );
      if (targetElement) {
        isManualNavigationRef.current = true;
        if (manualNavigationTimeoutRef.current) {
          clearTimeout(manualNavigationTimeoutRef.current);
        }

        let scrollEndTimer: NodeJS.Timeout | null = null;
        const onScroll = () => {
          if (scrollEndTimer) clearTimeout(scrollEndTimer);
          scrollEndTimer = setTimeout(() => {
            isManualNavigationRef.current = false;
            container.removeEventListener('scroll', onScroll);
          }, 150);
        };
        container.addEventListener('scroll', onScroll, { passive: true });

        const targetRect = targetElement.getBoundingClientRect();
        const scrollTop =
          container.scrollTop + targetRect.top - containerRect.top - 50; // 50px offset for better visibility;
        container.scrollTo({ top: scrollTop, behavior: 'smooth' });

        manualNavigationTimeoutRef.current = setTimeout(() => {
          isManualNavigationRef.current = false;
          container.removeEventListener('scroll', onScroll);
        }, 1000);
      }
    }
  };

  // Reset refs array when operations change
  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, activeOperations.length);
    // Create refs for diff views
    diffViewRefs.current = Array(activeOperations.length)
      .fill(null)
      .map(
        (_, i) => diffViewRefs.current[i] || React.createRef<HTMLDivElement>()
      );
  }, [activeOperations.length]);

  // Update global view mode when settings change
  useEffect(() => {
    setGlobalViewMode(
      applicationSettings?.diffViewMode || SETTINGS.defaults.application.diffViewMode
    );
    // Reset overrides when global setting changes
    setExpandedFiles(new Set());
    setCollapsedFiles(new Set());
  }, [applicationSettings?.diffViewMode]);

  // Handle operations list changes - clamp currentIdx to valid range
  useEffect(() => {
    if (activeOperations.length === 0) {
      setCurrentIdx(0);
    } else if (currentIdx >= activeOperations.length) {
      setCurrentIdx(activeOperations.length - 1);
    }
  }, [activeOperations.length, currentIdx]);

  // Update diff blocks when current index changes
  useEffect(() => {
    // Reset diff blocks when switching files
    setCurrentDiffBlocks([]);
  }, [currentIdx]);

  // Handle scroll to update diff navigation button states
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let debounceTimer: NodeJS.Timeout;

    const updateButtonStates = () => {
      const diffViewRef = diffViewRefs.current[currentIdx];
      const diffView = diffViewRef?.current;

      if (
        !diffView ||
        !containerRef.current ||
        currentDiffBlocks.length === 0
      ) {
        setIsPrevDiffDisabled(true);
        setIsNextDiffDisabled(true);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const lineElements = diffView.querySelectorAll('[data-line-index]');
      let topLineIndex = -1;

      for (let i = 0; i < lineElements.length; i++) {
        const lineRect = lineElements[i].getBoundingClientRect();
        if (lineRect.top >= containerRect.top) {
          topLineIndex = parseInt(
            lineElements[i].getAttribute('data-line-index') || '-1'
          );
          break;
        }
      }

      if (topLineIndex === -1 && lineElements.length > 0) {
        topLineIndex =
          parseInt(
            lineElements[lineElements.length - 1].getAttribute(
              'data-line-index'
            ) || '-1'
          ) + 1;
      }

      const hasPrev = currentDiffBlocks.some(
        (block) => block.start < topLineIndex
      );

      // For “next”, mirror goNextDiff’s logic so the enabled/disabled state is
      // accurate even when the viewport is on pre-hunk context lines.
      const DIFF_NAV_CONTEXT_LINES = 3;
      let searchRefLine: number;
      const currentBlock = currentDiffBlocks.find(
        (b) =>
          topLineIndex >= b.start - DIFF_NAV_CONTEXT_LINES &&
          topLineIndex <= b.end
      );
      searchRefLine = currentBlock ? currentBlock.end : topLineIndex;

      const hasNext = currentDiffBlocks.some(
        (block) => block.start > searchRefLine
      );

      setIsPrevDiffDisabled(!hasPrev);
      setIsNextDiffDisabled(!hasNext);
    };

    const debouncedHandler = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateButtonStates, 100);
    };

    container.addEventListener('scroll', debouncedHandler, { passive: true });
    updateButtonStates(); // Initial check

    return () => {
      clearTimeout(debounceTimer);
      container.removeEventListener('scroll', debouncedHandler);
    };
  }, [currentIdx, currentDiffBlocks]);

  // Handle scroll to update current index based on the item at the top of the viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let debounceTimer: NodeJS.Timeout;

    const handleScroll = () => {
      if (
        !containerRef.current ||
        !stickyHeaderRef.current ||
        itemRefs.current.length === 0
      ) {
        return;
      }

      // The focal point should be where items appear after navigation
      // This is NAVIGATION_PADDING_ABOVE pixels below the bottom of the sticky header
      const headerRect = stickyHeaderRef.current.getBoundingClientRect();
      const headerBottom = headerRect.bottom;
      const focalPointY = headerBottom + NAVIGATION_PADDING_ABOVE;

      let newCurrentIdx = -1;

      // Find the last item whose top is at or above the focal point
      for (let i = 0; i < itemRefs.current.length; i++) {
        const itemRef = itemRefs.current[i];
        if (!itemRef) continue;

        const itemRect = itemRef.getBoundingClientRect();
        // Check if the top of the item has scrolled past the focal point
        if (itemRect.top <= focalPointY) {
          newCurrentIdx = i;
        } else {
          // Since items are ordered, we can stop once we find one below the focal point
          break;
        }
      }

      // If no item's top has passed the focal point (e.g. at the very top of the list),
      // default to the first item.
      if (newCurrentIdx === -1 && itemRefs.current.length > 0) {
        newCurrentIdx = 0;
      }

      // Only update if we're not in manual navigation mode
      if (
        !isManualNavigationRef.current &&
        newCurrentIdx !== -1 &&
        newCurrentIdx !== currentIdx
      ) {
        setCurrentIdx(newCurrentIdx);
      }
    };

    const debouncedScrollHandler = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleScroll, 100);
    };

    container.addEventListener('scroll', debouncedScrollHandler, {
      passive: true,
    });
    handleScroll(); // Initial check

    return () => {
      clearTimeout(debounceTimer);
      container.removeEventListener('scroll', debouncedScrollHandler);
    };
  }, [currentIdx, activeOperations.length]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (manualNavigationTimeoutRef.current) {
        clearTimeout(manualNavigationTimeoutRef.current);
      }
    };
  }, []);

  if (!hasProject) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">⚡</div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Apply AI Changes
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            When you get code suggestions from AI assistants, paste them into
            the workbench. Athanor will parse the changes and show them here for
            review before applying to your files.
          </p>
          <button
            onClick={() => window.fileService.openFolder()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            Open Project Folder
          </button>
        </div>
      </div>
    );
  }

  if (!activeOperations.length) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8">
        <div className="text-center max-w-lg">
          <GitCompare className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
            No Changes to Review
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This panel displays AI-proposed changes and uncommitted Git diffs.
          </p>
          <div className="mt-6 text-sm text-left space-y-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
            <p className="flex items-start gap-2">
              <Bot
                size={18}
                className="text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5"
              />
              <span>
                <strong>AI changes</strong> appear here after you use the "Apply
                AI Output" action. This processes responses from prompts like
                Coder <Wrench size={16} className="inline-block -mt-0.5" /> or
                Writer <Pen size={16} className="inline-block -mt-0.5" />.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <GitCompare
                size={18}
                className="text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5"
              />
              <span>
                For <strong>Git changes</strong>, click the{' '}
                <GitCompare size={16} className="inline-block -mt-0.5" /> button
                above the file explorer.
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full overflow-y-auto">
      {activeOperations.length > 0 && (
        <div
          ref={stickyHeaderRef}
          className="sticky top-0 z-10 flex items-center gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur px-4 py-2 border-b border-gray-200 dark:border-gray-700"
        >
          <button
            onClick={goTop}
            title="Go to top"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors flex items-center gap-1"
          >
            <ChevronsUp size={16} />
          </button>
          <button
            onClick={goPrev}
            disabled={currentIdx <= 0 || activeOperations.length <= 1}
            title="Previous file"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-700 flex items-center gap-1"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={goNext}
            disabled={
              currentIdx >= activeOperations.length - 1 ||
              activeOperations.length <= 1
            }
            title="Next file"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-700 flex items-center gap-1"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={goEnd}
            disabled={activeOperations.length === 0}
            title="Go to end of current file"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-700 flex items-center gap-1"
          >
            <ChevronDown size={16} />
          </button>
          <button
            onClick={goBottom}
            title="Go to bottom"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors flex items-center gap-1"
          >
            <ChevronsDown size={16} />
          </button>
          <div className="border-l border-gray-300 dark:border-gray-600 h-6 mx-2" />
          <button
            onClick={() => {
              setGlobalViewMode('compact');
              setExpandedFiles(new Set());
              setCollapsedFiles(new Set());
            }}
            disabled={
              globalViewMode === 'compact' &&
              expandedFiles.size === 0 &&
              collapsedFiles.size === 0
            }
            title="Collapse all diffs to compact view"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronsDownUp size={16} />
          </button>
          <button
            onClick={() => {
              setGlobalViewMode('full');
              setExpandedFiles(new Set());
              setCollapsedFiles(new Set());
            }}
            disabled={
              globalViewMode === 'full' &&
              expandedFiles.size === 0 &&
              collapsedFiles.size === 0
            }
            title="Expand all diffs to show full files"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronsUpDown size={16} />
          </button>
          <div className="border-l border-gray-300 dark:border-gray-600 h-6 mx-2" />
          <button
            onClick={goPrevDiff}
            disabled={isPrevDiffDisabled}
            title="Previous diff block"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-700 flex items-center gap-1"
          >
            <ChevronLeft size={16} />
            <GitCompare size={14} />
          </button>
          <button
            onClick={goNextDiff}
            disabled={isNextDiffDisabled}
            title="Next diff block"
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-700 flex items-center gap-1"
          >
            <GitCompare size={14} />
            <ChevronRight size={16} />
          </button>
          {mode === 'ai' && (
            <button
              onClick={applyAllChanges}
              disabled={!hasPendingOperations}
              title={
                hasPendingOperations
                  ? 'Accept all pending changes'
                  : 'No pending changes to accept'
              }
              className="ml-auto px-3 py-1 bg-green-500 dark:bg-green-600 text-white rounded hover:bg-green-600 dark:hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Accept All
            </button>
          )}
          <button
            onClick={rejectAllChanges}
            disabled={!hasPendingOperations}
            title={
              mode === 'git'
                ? 'Revert all changes to the last commit'
                : hasPendingOperations
                  ? 'Reject all pending changes'
                  : 'No pending changes to reject'
            }
            className={`${mode === 'ai' ? 'ml-2' : 'ml-auto'} px-3 py-1 bg-red-500 dark:bg-red-600 text-white rounded hover:bg-red-600 dark:hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {mode === 'git' ? 'Revert All' : 'Reject All'}
          </button>
          <button
            onClick={handleClear}
            disabled={activeOperations.length === 0}
            title={
              activeOperations.length === 0
                ? 'No changes to clear'
                : mode === 'git'
                  ? 'Clear all changes'
                  : hasPendingOperations
                    ? 'Clear all changes (confirmation required)'
                    : 'Clear all changes'
            }
            className="ml-2 px-3 py-1 bg-gray-500 dark:bg-gray-600 text-white rounded hover:bg-gray-600 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <X size={16} />
            Clear
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-4">
            {activeOperations.length > 0 ? currentIdx + 1 : 0} /{' '}
            {activeOperations.length}
          </span>
        </div>
      )}
      <div className="p-4 space-y-4">
        <div className="space-y-6">
          {activeOperations.map((op, idx) => {
            let isCompact: boolean;
            if (expandedFiles.has(idx)) {
              isCompact = false;
            } else if (collapsedFiles.has(idx)) {
              isCompact = true;
            } else {
              isCompact = globalViewMode === 'compact';
            }

            const toggleFileCompact = () => {
              setExpandedFiles((prev) => {
                const nextExpanded = new Set(prev);
                setCollapsedFiles((prevCollapsed) => {
                  const nextCollapsed = new Set(prevCollapsed);

                  if (isCompact) {
                    // Currently compact, so expand
                    nextExpanded.add(idx);
                    nextCollapsed.delete(idx);
                  } else {
                    // Currently expanded, so collapse
                    nextExpanded.delete(idx);
                    nextCollapsed.add(idx);
                  }
                  return nextCollapsed;
                });
                return nextExpanded;
              });
            };

            return (
              <FileOperationItem
                key={`${op.file_path}-${idx}`}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                operation={op}
                index={idx}
                mode={mode}
                onAccept={applyChange}
                onReject={rejectChange}
                isActive={idx === currentIdx}
                onDiffBlocksCalculated={(blocks) => {
                  if (idx === currentIdx) {
                    setCurrentDiffBlocks(blocks);
                  }
                }}
                diffViewRef={diffViewRefs.current[idx]}
                isCompact={isCompact}
                onToggleCompact={toggleFileCompact}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
ReviewPanel.displayName = 'ReviewPanel';

export default ReviewPanel;
