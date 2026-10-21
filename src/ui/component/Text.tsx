import { useViewModelState } from '@state/hook/useViewModel';
import { Constant } from '@util/constant';
import React, { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface TextProps {
  /**
   * The figure's live region, which the screen-reader announcements are
   * rendered into. It belongs to the figure rather than to this component
   * (see `Maidr`), so it is already on the page when the first announcement
   * arrives.
   */
  announcer: HTMLElement;
}

const Text: React.FC<TextProps> = ({ announcer }) => {
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

  // The region is the figure's, so the ARIA mode the reader chose in settings
  // is put on it here, where the setting is read. It is in force while they are
  // in the chart, the only time the region speaks. A layout effect, so a mode
  // read as the reader enters is on the region in the same commit as the first
  // announcement; assertive and polite are both live, so a switch drops nothing.
  const ariaMode = settings.general.ariaMode;
  useLayoutEffect(() => {
    announcer.setAttribute('aria-live', ariaMode);
  }, [announcer, ariaMode]);

  return (
    <div>
      <div id={Constant.TEXT_CONTAINER}>
        {visual && visual.trim().length > 0 && (
          <p>
            {visual}
          </p>
        )}
      </div>

      {/* Screen-reader announcement.
          `key={revision}` makes every text update -- an identical one too --
          a new element in the figure's `aria-live` region, and a node added
          to a live region already on the page is what screen readers
          announce. It is a `div` because a block is an accessible object of
          its own: Chromium tells a region's new child from the old one by
          that object, where a replaced run of identical text is no change
          at all, so a repeat would go unsaid.

          This used to be a new `role="alert"` element per update. That
          announced too, but NVDA speaks an alert's role before its text, so
          every arrow key said "alert" first. */}
      {current && createPortal(<div key={revision}>{current}</div>, announcer)}

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
