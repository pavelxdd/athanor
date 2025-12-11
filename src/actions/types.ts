// Action state types
export type ActionState = 'loading' | 'noTask' | 'noSelection' | 'noGit';

// Common action parameters
export interface BaseActionParams {
  addLog: (message: string) => void;
  setIsLoading: (loading: boolean) => void;
}
