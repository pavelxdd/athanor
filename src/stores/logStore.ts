import { create } from 'zustand';

export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  level?: 'info' | 'error' | 'warning';
  onClick?: () => void;
}

interface LogState {
  logs: LogEntry[];
  nextId: number;
  addLog: (messageOrEntry: string | Omit<LogEntry, 'id' | 'timestamp'>) => void;
}

export const useLogStore = create<LogState>((set) => ({
  logs: [],
  nextId: 1,
  addLog: (messageOrEntry) =>
    set((state) => {
      const timestamp = new Date().toLocaleTimeString();
      const nextId = state.nextId;

      const newEntry: LogEntry =
        typeof messageOrEntry === 'string'
          ? {
              id: nextId,
              timestamp,
              message: messageOrEntry,
              level: 'info', // Default level for simple string messages
            }
          : {
              id: nextId,
              timestamp,
              ...messageOrEntry,
            };

      return {
        logs: [...state.logs, newEntry],
        nextId: nextId + 1,
      };
    }),
}));
