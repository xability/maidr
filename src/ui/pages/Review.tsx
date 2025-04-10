import type { FC } from 'react';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useRef } from 'react';

const Review: FC = () => {
  const { value } = useViewModelState('review');
  const viewModel = useViewModel('review');
  const reviewRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inputElement = reviewRef.current;
    inputElement?.focus();
  }, [reviewRef, viewModel]);

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    const isNavigationKey
      = e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End';
    const isCtrlKey = e.ctrlKey || e.metaKey;
    const isModifierKey = isCtrlKey || e.shiftKey;

    if (e.key === 'r') {
      viewModel.toggle();
    } else if (
      !isNavigationKey // Navigate next character with Arrow keys.
      && !(isModifierKey && isNavigationKey) // Navigate to Start and End.
      && !(isCtrlKey && e.key === 'a') // Select text.
      && !(isCtrlKey && e.key === 'c') // Copy text.
      && !(e.key === 'Tab') // Allow blur after focused.
      && !(e.key === 'r') // Allow toggle review mode.
    ) {
      e.preventDefault();
    }
  };

  return (
    <div id="maidr-review-container">
      <input
        ref={reviewRef}
        type="text"
        autoComplete="off"
        size={50}
        defaultValue={value}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};

export default Review;
