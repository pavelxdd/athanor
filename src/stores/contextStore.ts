import { create } from 'zustand';

interface ContextState {
  selectedFiles: Set<string>;
  userSelectedPaths: string[];
  setContext: (selectedPaths: string[]) => void;
  clearContext: () => void;
}

export const useContextStore = create<ContextState>((set) => ({
  selectedFiles: new Set(),
  userSelectedPaths: [],

  setContext: (selectedPaths: string[]) => {
    set({
      selectedFiles: new Set(selectedPaths),
      userSelectedPaths: selectedPaths,
    });
  },

  clearContext: () => {
    set({
      selectedFiles: new Set(),
      userSelectedPaths: [],
    });
  },
}));
