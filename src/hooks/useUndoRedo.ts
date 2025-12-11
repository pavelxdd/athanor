import { useCallback, useRef } from 'react';
import { useWorkbenchStore } from '../stores/workbenchStore';

/**
 * Simple undo/redo hook that leverages browser's native undo/redo functionality
 * by using document.execCommand for text insertion which integrates with undo history
 */
export const useUndoRedo = (
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  tabIndex: number
) => {
  const { setTabContent } = useWorkbenchStore();
  const isApplying = useRef(false);

  // Insert text while ensuring browser tracks it for undo
  const insertText = useCallback((text: string, selectionStart?: number, selectionEnd?: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Focus textarea for execCommand to work properly
    textarea.focus();

    // Set selection if provided (for cursor position insertion)
    // If not provided, select all for full content replacement
    if (selectionStart !== undefined) {
      const start = Math.max(0, Math.min(selectionStart, textarea.value.length));
      const end = selectionEnd !== undefined
        ? Math.max(start, Math.min(selectionEnd, textarea.value.length))
        : start;
      textarea.setSelectionRange(start, end);
    } else {
      // Select all content for replacement
      textarea.setSelectionRange(0, textarea.value.length);
    }

    // Mark that we're applying a programmatic change
    isApplying.current = true;

    try {
      // Use document.execCommand for better undo integration
      // This creates a proper undo entry in the browser's history
      const success = document.execCommand('insertText', false, text);

      if (success) {
        // execCommand succeeded, the browser should track this for undo
        // Update React state to stay in sync
        setTabContent(tabIndex, textarea.value);
      } else {
        // Fallback: direct value manipulation
        const currentStart = textarea.selectionStart;
        const currentEnd = textarea.selectionEnd;
        const newValue = textarea.value.slice(0, currentStart) + text + textarea.value.slice(currentEnd);

        textarea.value = newValue;
        textarea.setSelectionRange(currentStart + text.length, currentStart + text.length);

        // Trigger input event to let React know about the change
        const event = new Event('input', { bubbles: true });
        textarea.dispatchEvent(event);

        // Update React state
        setTabContent(tabIndex, newValue);
      }

    } finally {
      // Reset applying flag
      isApplying.current = false;
    }
  }, [textareaRef, tabIndex, setTabContent]);

  // Handle regular input events (user typing, pasting)
  const handleInput = useCallback((_e: React.FormEvent<HTMLTextAreaElement>) => {
    if (!isApplying.current) {
      // Normal user input - let the component handle the React state update
      // We don't update state here to avoid double updates
    }
  }, []);

  // Handle beforeinput events for better integration
  const handleBeforeInput = useCallback((_e: React.FormEvent<HTMLTextAreaElement>) => {
    // Let the browser handle native input events
    // This ensures proper undo/redo tracking for user input
  }, []);

  return {
    insertText,
    handleInput,
    handleBeforeInput,
  };
};