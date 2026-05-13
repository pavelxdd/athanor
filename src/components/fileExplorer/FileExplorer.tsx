import React from 'react';
import { FileItem } from '../../utils/fileTree';
import FileContextMenu from '../FileContextMenu';
import FileExplorerItem from './FileExplorerItem';
import { useFileExplorer } from './hooks/useFileExplorer';

interface FileExplorerProps {
  items: FileItem[];
  level?: number;
  onViewFile?: () => void;
  onRefresh?: () => void;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  items,
  level = 0,
  onViewFile = () => {},
  onRefresh = () => {},
}) => {
  const {
    explorerRef,
    expandedFolders,
    contextMenu,
    handleIgnoreItem,
    toggleFolder,
    toggleFolderRecursive,
    handleContextMenu,
    handleCloseContextMenu,
    handleExpandRecursively,
    handleCollapseRecursively,
  } = useFileExplorer(items, onRefresh);

  return (
    <div
      ref={explorerRef}
      className="select-none relative h-full overflow-y-auto scrollbar-thin"
      onMouseLeave={handleCloseContextMenu}
    >
      {items.map((item) => (
        <FileExplorerItem
          key={item.id}
          item={item}
          level={level}
          isRoot={level === 0}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
          onToggleFolderRecursive={toggleFolderRecursive}
          onViewFile={onViewFile}
          onContextMenu={handleContextMenu}
        />
      ))}

      {contextMenu && (
        <FileContextMenu
          type={contextMenu.item.type}
          name={contextMenu.item.name}
          path={contextMenu.item.path}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onIgnoreItem={handleIgnoreItem}
          onExpandRecursively={() => handleExpandRecursively(contextMenu.item)}
          onCollapseRecursively={() => handleCollapseRecursively(contextMenu.item)}
        />
      )}
    </div>
  );
};

export default FileExplorer;
