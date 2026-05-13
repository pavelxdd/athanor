import { create } from 'zustand';
import { FileItem } from '../utils/fileTree';
import { DOC_FORMAT } from '../utils/constants';
import { AthanorConfig } from '../types/global';

interface FileSystemState {
  // File tree state
  fileTree: FileItem[];
  setFileTree: (tree: FileItem[]) => void;

  // Effective configuration (includes settings overrides)
  effectiveConfig: AthanorConfig | null;
  setEffectiveConfig: (config: AthanorConfig | null) => void;

  // Preview file path
  previewedFilePath: string | null;
  setPreviewedFilePath: (path: string | null) => void;

  // File tree inclusion setting
  includeFileTree: boolean;
  toggleFileTree: () => void;

  // Format type setting
  formatType: string;
  toggleFormatType: () => void;

  // Project info inclusion setting
  includeProjectInfo: boolean;
  toggleProjectInfo: () => void;

  // Refresh state
  isRefreshing: boolean;
  setIsRefreshing: (refreshing: boolean) => void;
  resetState: () => void;
  isGraphAnalysisInProgress: boolean;
  setIsGraphAnalysisInProgress: (inProgress: boolean) => void;
}

export const useFileSystemStore = create<FileSystemState>((set) => ({
  isRefreshing: false,
  setIsRefreshing: (refreshing: boolean) => set({ isRefreshing: refreshing }),

  fileTree: [],
  setFileTree: (tree: FileItem[]) => set({ fileTree: tree }),

  effectiveConfig: null,
  setEffectiveConfig: (config: AthanorConfig | null) => set({ effectiveConfig: config }),

  resetState: () => {
    return set({
      // Clear UI state
      previewedFilePath: null,
      isRefreshing: false,

      // Clear file system state
      fileTree: [],

      // Clear effective configuration
      effectiveConfig: null,

      // New defaults for prompt generation settings
      includeFileTree: false,
      includeProjectInfo: false,
      formatType: DOC_FORMAT.MARKDOWN,
      isGraphAnalysisInProgress: false,
    });
  },

  // File tree inclusion setting (true = include file tree in generated prompt)
  includeFileTree: false,
  toggleFileTree: () =>
    set((state) => ({
      includeFileTree: !state.includeFileTree,
    })),

  // Format type setting (XML or Markdown)
  formatType: DOC_FORMAT.MARKDOWN,
  toggleFormatType: () =>
    set((state) => ({
      formatType: state.formatType === DOC_FORMAT.XML ? DOC_FORMAT.MARKDOWN : DOC_FORMAT.XML,
    })),

  // Project info inclusion setting (true = include project info in generated prompt)
  includeProjectInfo: false,
  toggleProjectInfo: () =>
    set((state) => ({
      includeProjectInfo: !state.includeProjectInfo,
    })),

  previewedFilePath: null,
  setPreviewedFilePath: (path: string | null) => set({ previewedFilePath: path }),
  isGraphAnalysisInProgress: false,
  setIsGraphAnalysisInProgress: (inProgress: boolean) =>
    set({ isGraphAnalysisInProgress: inProgress }),
}));
