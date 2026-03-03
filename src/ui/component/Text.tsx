import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React from 'react';

/**
 * Visually-hidden style that keeps an element in the accessibility tree
 * but invisible on screen (standard "sr-only" / "clip" pattern).
 */
const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const Text: React.FC = () => {
  const { enabled, announce, value, revision, message } = useViewModelState('text');
  const { rotor_value } = useViewModelState('rotor');
  const settings = useViewModelState('settings');
  const navText = (enabled && value) || '';
  const messageText = typeof message === 'string' ? message : '';

  // Current text to expose via live region: prefer message, else nav when announce is enabled
  const current = messageText.trim().length > 0
    ? messageText
    : (announce && navText ? navText : '');

  const visual = messageText.trim().length > 0 ? messageText : navText;

  return (
    <div>
      <div id={Constant.TEXT_CONTAINER}>
        {visual && visual.trim().length > 0 && (
          <p>
            {visual}
          </p>
        )}
      </div>

      {/* Screen-reader announcement region.
          Using `key={revision}` forces React to unmount and re-mount this element
          on every text update (including identical text). Inserting a fresh
          role="alert" element into the DOM is the most reliable way to trigger
          screen-reader announcements across NVDA, JAWS, and VoiceOver — without
          resorting to invisible Unicode characters. */}
      {current && (
        <div key={revision} role="alert" style={visuallyHidden}>
          {current}
        </div>
      )}

      <div
        id={Constant.ROTOR_AREA}
        aria-live={settings.general.ariaMode}
      >
        {rotor_value}
      </div>

    </div>
  );
};

export default Text;
