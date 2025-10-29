import { useState, useEffect, useCallback, useRef } from 'react';

interface LogPanelResizeHook {
  logPanelHeight: number;
  isResizing: boolean;
  resizeRef: React.RefObject<HTMLDivElement | null>;
  startResize: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function useLogPanelResize(
  minHeight = 50,
  maxHeight = 400,
  defaultHeight = 192
): LogPanelResizeHook {
  const [logPanelHeight, setLogPanelHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleResize = (e: MouseEvent) => {
      if (isResizing) {
        // Calculate new height based on window height and mouse position
        const newHeight = Math.max(
          minHeight,
          Math.min(maxHeight, window.innerHeight - e.clientY)
        );
        setLogPanelHeight(newHeight);
      }
    };

    const stopResize = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', stopResize);
    }

    return () => {
      window.removeEventListener('mousemove', handleResize);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [isResizing, minHeight, maxHeight]);

  return {
    logPanelHeight,
    isResizing,
    resizeRef,
    startResize,
  };
}
