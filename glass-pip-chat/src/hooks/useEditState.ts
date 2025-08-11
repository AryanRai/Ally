import { useState, useEffect, useRef } from 'react';

interface UseEditStateOptions {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel?: () => void;
}

/**
 * Reusable hook for managing edit state (used for chat titles, messages, etc.)
 */
export function useEditState({ initialValue, onSave, onCancel }: UseEditStateOptions) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEdit = (value?: string) => {
    setEditValue(value || initialValue);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (editValue.trim() && editValue !== initialValue) {
      onSave(editValue.trim());
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditValue(initialValue);
    setIsEditing(false);
    onCancel?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  return {
    isEditing,
    editValue,
    setEditValue,
    inputRef,
    startEdit,
    saveEdit,
    cancelEdit,
    handleKeyDown
  };
}