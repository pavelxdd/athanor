import React, { useState } from 'react';
import { ChevronRight, ChevronDown, File, Book } from 'lucide-react';
import { FileItem, getBaseName, isEmptyFolder } from '../../utils/fileTree';
import {
  FILE_SYSTEM,
  DRAG_DROP,
} from '../../utils/constants';
import {
  areAllDescendantsSelected,
  areSomeDescendantsSelected,
} from '../../utils/fileSelection';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import { useWorkbenchStore } from '../../stores/workbenchStore';
import { useContextStore } from '../../stores/contextStore';
import useDarkMode from '../../hooks/useDarkMode';

interface FileExplorerItemProps {
  item: FileItem;
  level: number;
  isRoot?: boolean;
  expandedFolders: Set<string>;
  onToggleFolder: (itemId: string) => void;
  onToggleFolderRecursive: (item: FileItem) => void;
  onViewFile: () => void;
  onContextMenu: (e: React.MouseEvent, item: FileItem) => void;
}

const FileExplorerItem: React.FC<FileExplorerItemProps> = React.memo(({
  item,
  level,
  isRoot = false,
  expandedFolders,
  onToggleFolder,
  onToggleFolderRecursive,
  onViewFile,
  onContextMenu,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  
  // Use granular selectors to avoid re-renders when unrelated state changes (like prompt typing)
  const previewedFilePath = useFileSystemStore(s => s.previewedFilePath);
  const fileTree = useFileSystemStore(s => s.fileTree);
  const setPreviewedFilePath = useFileSystemStore(s => s.setPreviewedFilePath);
  
  const toggleFileSelection = useWorkbenchStore(s => s.toggleFileSelection);
  const selectedFiles = useWorkbenchStore(s => s.tabs[s.activeTabIndex]?.selectedFiles || []);
  
  const contextSelected = useContextStore(s => s.selectedFiles);
  
  // Removed unused hooks or selectors if possible
  // useDarkMode is likely fine as it changes rarely
  const isDarkMode = useDarkMode();
  const checkboxRef = React.useRef<HTMLInputElement>(null);

  // Determine the context tier for visual styling
  const isContextSelected = contextSelected.has(item.id);

  // Convert to Set for efficient O(1) lookups in selection checks
  // Memoize this set to avoid recreation if selectedFiles array ref hasn't changed
  const selectedFilesSet = React.useMemo(() => new Set(selectedFiles), [selectedFiles]);

  const isExpanded = expandedFolders.has(item.id);
  const hasSelectedDescendants = React.useMemo(() => areSomeDescendantsSelected(
    item,
    selectedFilesSet
  ), [item, selectedFilesSet]);
  
  const allDescendantsSelected = React.useMemo(() => areAllDescendantsSelected(
    item,
    selectedFilesSet
  ), [item, selectedFilesSet]);
  
  const isEmpty = isEmptyFolder(item);
  const isCurrentlyViewed = item.path === previewedFilePath;

  // Handle checkbox indeterminate state
  React.useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate =
        hasSelectedDescendants && !allDescendantsSelected;
    }
  }, [hasSelectedDescendants, allDescendantsSelected]);

  // Handle drag start
  const handleDragStart = (e: React.DragEvent) => {
    if (isEmpty) return; // Prevent dragging empty folders

    try {
      // Use the item's ID which is already relative to root
      const relativePath = item.id === '/' ? '' : item.id;

      // Set both the custom MIME type and fallback text
      e.dataTransfer.setData('text/plain', relativePath);
      e.dataTransfer.effectAllowed = 'copy';
      setIsDragging(true);

      console.log('Started drag with path:', relativePath);
    } catch (error) {
      console.error('Error preparing drag data:', error);
    }
  };

  // Handle drag end
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Get the display name - for root level, handle supplementary materials directory specially
  const displayName =
    isRoot && item.path.endsWith(FILE_SYSTEM.materialsDirName)
      ? 'Supplementary Materials'
      : isRoot
        ? getBaseName(item.path)
        : item.name;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFileSelection(item.id, item.type === 'folder', fileTree);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click (button === 1) for recursive toggle
    if (e.button === 1 && item.type === 'folder') {
      e.preventDefault();
      e.stopPropagation();
      onToggleFolderRecursive(item);
    }
  };

  const handleFileClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isNameOrIcon =
      target.classList.contains('file-name') ||
      target.classList.contains('file-icon') ||
      target.closest('.file-icon-wrapper');

    if (isNameOrIcon) {
      if (item.type === 'file') {
        setPreviewedFilePath(item.path);
        onViewFile();
      } else if (item.type === 'folder') {
        onToggleFolder(item.id);
      }
    }
  };

  return (
    <div className="select-none" style={{ paddingLeft: level ? '25px' : '0' }}>
      <div
        className={`file-item-row flex items-center py-1 rounded-sm ${isContextSelected ? 'bg-blue-100 dark:bg-blue-900/40' : ''}`}
        onClick={handleFileClick}
        onMouseDown={handleMouseDown}
        onContextMenu={(e) => onContextMenu(e, item)}
      >
        {/* Checkbox or placeholder - Not draggable */}
        <div className="w-5 flex-shrink-0" onClick={handleCheckboxClick}>
          {!isEmpty && (
            <input
              ref={checkboxRef}
              type="checkbox"
              checked={allDescendantsSelected}
              onChange={() => {}} // Handle in onClick instead
              className="cursor-pointer"
            />
          )}
        </div>

        {/* Draggable content area */}
        <div
          className={`flex flex-1 items-center ${
            !isEmpty ? DRAG_DROP.classes.draggable : ''
          } ${isDragging ? DRAG_DROP.classes.dragging : ''}`}
          draggable={!isEmpty}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Folder expand/collapse button or file icon */}
          <div className="flex-shrink-0">
            {item.type === 'folder' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFolder(item.id);
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded flex-shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown size={16} className="flex-shrink-0" />
                ) : (
                  <ChevronRight size={16} className="flex-shrink-0" />
                )}
              </button>
            ) : level === 0 && item.name === 'External Resources' ? (
              <div className="p-1">
                <Book
                  size={16}
                  className="text-purple-600 dark:text-purple-400"
                />
              </div>
            ) : (
              <div className="p-1">
                <File
                  size={16}
                  className="file-icon text-gray-600 dark:text-gray-400"
                />
              </div>
            )}
          </div>

          {/* Filename */}
          <span
            className={`truncate file-name cursor-pointer
              ${isRoot ? 'font-bold' : ''}
              ${isCurrentlyViewed ? 'font-bold text-blue-600 dark:text-blue-400' : ''}
            `}
          >
            {displayName}
            {item.type === 'folder' ? '/' : ''}
          </span>
        </div>
      </div>

      {/* Render children recursively if expanded */}
      {item.type === 'folder' &&
        isExpanded &&
        item.children &&
        item.children.length > 0 && (
          <div>
            {item.children.map((child) => (
              <FileExplorerItem
                key={child.id}
                item={child}
                level={level + 1}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                onToggleFolderRecursive={onToggleFolderRecursive}
                onViewFile={onViewFile}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
    </div>
  );
});

export default FileExplorerItem;
