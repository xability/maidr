import Box from '@mui/material/Box';
import { useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useState } from 'react';

/** Diameter of the dial, in pixels. */
const DIAL_SIZE = 240;
/** Distance of the ring's mode names from the dial's centre, in pixels. */
const RING_RADIUS = 88;
/** Widest a mode name on the ring may run before it is cut short, in pixels. */
const RING_LABEL_WIDTH = 72;
/** Width of the current mode's name in the dial's centre, in pixels. */
const CENTRE_WIDTH = 120;
/** How long a turn of the ring takes, in milliseconds. */
const TURN_MS = 350;
/** How long the dial stays up after the last turn, in milliseconds. */
const SHOW_MS = 1500;
/** How long the dial takes to fade out, in milliseconds. */
const FADE_MS = 300;

const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';
const FORCED_COLORS = '@media (forced-colors: active)';

interface RotorDialProps {
  plot: HTMLElement;
}

interface RotorRingProps {
  labels: string[];
  index: number;
  turn: number;
  direction: 1 | -1;
}

interface Position {
  left: number;
  top: number;
}

/**
 * Steps between mode `i` and the current mode, the short way round the ring.
 */
function ringDistance(i: number, index: number, count: number): number {
  const d = Math.abs(i - index) % count;
  return Math.min(d, count - d);
}

/**
 * Opacity of a mode name on the ring: the current mode in full, its
 * neighbours dimmed, the rest faint, as the VoiceOver rotor shows them.
 */
function ringOpacity(distance: number): number {
  if (distance === 0) {
    return 1;
  }
  return distance === 1 ? 0.6 : 0.25;
}

/**
 * The ring of mode names round the dial, turned so the current mode sits at
 * the top. A ring that has just appeared starts one step back and turns into
 * place, so even the first press shows the turn.
 */
const RotorRing: React.FC<RotorRingProps> = ({ labels, index, turn, direction }) => {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Two frames: the first lets the starting angles reach the screen, so
    // the second has something to turn from.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const step = 360 / labels.length;
  const shownTurn = entered ? turn : turn - direction;

  return (
    <>
      {labels.map((label, i) => {
        // The next mode waits anticlockwise of the top, so a forward cycle
        // turns the ring clockwise, as a clockwise twist does on iOS.
        const angle = (shownTurn - i) * step;
        const distance = ringDistance(i, index, labels.length);
        return (
          <Box
            key={i}
            data-current={distance === 0 ? 'true' : undefined}
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              maxWidth: RING_LABEL_WIDTH,
              fontSize: '0.625rem',
              fontWeight: distance === 0 ? 700 : 400,
              lineHeight: 1.1,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: ringOpacity(distance),
              // Out to the ring and back upright, so the name rides round
              // the arc as the ring turns but always reads level.
              transform: `translate(-50%, -50%) rotate(${angle}deg) `
                + `translateY(-${RING_RADIUS}px) rotate(${-angle}deg)`,
              transition: `transform ${TURN_MS}ms ease-out, opacity ${TURN_MS}ms ease-out`,
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {label}
          </Box>
        );
      })}
    </>
  );
};

/**
 * A visual rotor dial, after the VoiceOver rotor on iOS: when the reader
 * cycles the rotor, a dial appears over the chart with the modes around its
 * ring, turns to put the new mode at the top -- clockwise for the next mode,
 * anticlockwise for the previous one, as on iOS -- and fades out.
 *
 * Purely visual, so `aria-hidden`: the mode change is already announced
 * through the rotor area's live region, and a second announcement here would
 * repeat it. The turn is dropped for readers who ask for reduced motion.
 */
const RotorDial: React.FC<RotorDialProps> = ({ plot }) => {
  const { dial } = useViewModelState('rotor');
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const revision = dial?.revision ?? 0;

  useEffect(() => {
    if (revision === 0) {
      return;
    }
    const rect = plot.getBoundingClientRect();
    setPosition({ left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 });
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, [revision, plot]);

  if (!dial || !position || dial.labels.length === 0) {
    return null;
  }

  const { labels, index, turn, direction } = dial;

  return (
    <Box
      aria-hidden="true"
      data-testid="maidr-rotor-dial"
      sx={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: DIAL_SIZE,
        height: DIAL_SIZE,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        bgcolor: 'rgba(28, 28, 30, 0.85)',
        color: '#fff',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        pointerEvents: 'none',
        zIndex: 1400,
        fontFamily: SYSTEM_FONT,
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        transition: `opacity ${FADE_MS}ms ease, visibility ${FADE_MS}ms`,
        [FORCED_COLORS]: {
          bgcolor: 'Canvas',
          color: 'CanvasText',
          border: '2px solid CanvasText',
        },
      }}
    >
      {/* Keyed by the ring's modes, so a new trace's ring starts afresh
          rather than spinning round from the old one's angles. */}
      <RotorRing
        key={labels.join('\u0000')}
        labels={labels}
        index={index}
        turn={turn}
        direction={direction}
      />
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: CENTRE_WIDTH,
          transform: 'translate(-50%, -50%)',
          fontSize: '0.875rem',
          fontWeight: 700,
          lineHeight: 1.2,
          textAlign: 'center',
          overflowWrap: 'anywhere',
        }}
      >
        {labels[index]}
      </Box>
    </Box>
  );
};

export default RotorDial;
