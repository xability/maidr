import type { Instance } from '@popperjs/core';
import { Tooltip as MuiTooltip } from '@mui/material';
import Box from '@mui/material/Box';
import { useViewModelState } from '@state/hook/useViewModel';
import { DomEventType } from '@type/event';
import React, { useEffect, useMemo, useRef, useState } from 'react';

interface TooltipProps {
  plot: HTMLElement;
}

const Tooltip: React.FC<TooltipProps> = ({ plot }) => {
  const { tooltip } = useViewModelState('display');
  const [isHovering, setIsHovering] = useState(false);

  const positionRef = useRef({ x: 0, y: 0 });
  const popperRef = useRef<Instance | null>(null);

  // Create a virtual element as anchor
  const virtualAnchor = useMemo(() => ({
    getBoundingClientRect: () =>
      new DOMRect(positionRef.current.x, positionRef.current.y, 0, 0),
  }), []);

  // Attach listeners to SVG on mount
  useEffect(() => {
    if (!plot) {
      return;
    }

    const handleMouseMove = (e: MouseEvent): void => {
      positionRef.current = { x: e.clientX, y: e.clientY };
      popperRef.current?.update?.();
      setIsHovering(true);
    };
    const handleMouseEnter = (): void => setIsHovering(true);
    const handleMouseLeave = (): void => setIsHovering(false);

    plot.addEventListener(DomEventType.MOUSE_MOVE, handleMouseMove);
    plot.addEventListener(DomEventType.MOUSE_ENTER, handleMouseEnter);
    plot.addEventListener(DomEventType.MOUSE_LEAVE, handleMouseLeave);

    return () => {
      plot.removeEventListener(DomEventType.MOUSE_MOVE, handleMouseMove);
      plot.removeEventListener(DomEventType.MOUSE_ENTER, handleMouseEnter);
      plot.removeEventListener(DomEventType.MOUSE_LEAVE, handleMouseLeave);
    };
  }, [plot]);

  return (
    <MuiTooltip
      title={tooltip.value}
      open={isHovering}
      placement="top"
      arrow
      slotProps={{
        popper: {
          popperRef,
          anchorEl: virtualAnchor,
        },
      }}
    >
      <Box sx={{ display: 'none' }}>TooltipAnchor</Box>
    </MuiTooltip>
  );
};

export default Tooltip;
