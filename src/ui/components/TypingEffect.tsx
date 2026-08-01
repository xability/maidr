import { Box } from '@mui/material';
import { useViewModelState } from '@state/hook/useViewModel';
import { containsLatex, ensureKatexStylesheet } from '@util/katex';
import { createChatSanitizeSchema } from '@util/markdownSanitize';
import React, { memo, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/** The `rehypePlugins` prop's own type, so nothing has to be imported for it. */
type RehypePlugins = NonNullable<
  React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']
>;

/** Stable empty list, so a message without maths never re-renders on identity. */
const NO_MATH_PLUGINS: RehypePlugins = [];

/** Built once: the allowlist is the same for every message on the page. */
const SANITIZE_SCHEMA = createChatSanitizeSchema();

interface TypingEffectProps {
  text: string;
  isUser: boolean;
  messageId: string;
  onTypingUpdate?: () => void;
}

// Tracks messages whose typing animation has already finished, so reopening the
// chat dialog (which remounts every bubble) does not replay the animation for
// historical messages. Keyed by message id + final text so the genuine
// "Processing request..." -> response transition still animates.
const completedAnimations = new Set<string>();

// Keep the module-level set bounded over long sessions. Evicting the oldest
// entries only means a very old message would re-animate if shown again.
const MAX_COMPLETED_ANIMATIONS = 500;

function markAnimationCompleted(key: string): void {
  completedAnimations.add(key);
  if (completedAnimations.size > MAX_COMPLETED_ANIMATIONS) {
    const oldest = completedAnimations.values().next().value;
    if (oldest !== undefined) {
      completedAnimations.delete(oldest);
    }
  }
}

export const TypingEffect: React.FC<TypingEffectProps> = memo(({ text, isUser, messageId, onTypingUpdate }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [mathPlugins, setMathPlugins] = useState<RehypePlugins>(NO_MATH_PLUGINS);
  const settings = useViewModelState('settings');
  const inIframe = useMemo(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);
  const containerStyle = useMemo<React.CSSProperties>(() => (
    inIframe
      ? { contain: 'layout style', willChange: 'auto', overflowWrap: 'anywhere', wordBreak: 'break-word' }
      : {}
  ), [inIframe]);

  // Keyed off the whole message rather than what has been typed so far: the
  // fetch starts the moment the response arrives, and has the length of the
  // animation to finish before the equation is on screen.
  const needsMath = useMemo(() => containsLatex(text), [text]);

  // KaTeX — ~340 kB of stylesheet and the larger part of its JS — is loaded
  // only for the messages that actually contain maths. Until it arrives the
  // equation renders as its own source text, which is legible and, more to the
  // point, is exactly what the live region below announces either way.
  //
  // `mathPlugins` tracks "KaTeX has been loaded", not "this message has maths",
  // so it is deliberately never cleared: should `text` stop matching (a streamed
  // response can gain and lose a delimiter pair mid-flight), rehype-katex is a
  // no-op on markdown that remark-math produced no maths nodes for. Dropping it
  // would re-render the bubble to reach the same output.
  useEffect(() => {
    if (!needsMath) {
      return;
    }

    let cancelled = false;
    ensureKatexStylesheet();
    import('rehype-katex')
      .then(({ default: rehypeKatex }) => {
        if (!cancelled) {
          setMathPlugins([rehypeKatex]);
        }
      })
      .catch((error) => {
        console.error('[maidr] could not load KaTeX to render maths', error);
      });

    return () => {
      cancelled = true;
    };
  }, [needsMath]);

  useEffect(() => {
    // Skip the animation for user messages, iframe embeds, and any message
    // whose animation already completed (e.g. historical messages shown again
    // after the dialog is reopened) — show the full text immediately.
    // Separated by an escaped NUL, which neither a message id nor a body
    // can contain, so no pair of messages can collide on one key.
    const animationKey = `${messageId}\0${text}`;
    if (isUser || inIframe || completedAnimations.has(animationKey)) {
      setDisplayedText(text);
      setIsTyping(false);
      return;
    }

    // Genuinely new content: (re)start the animation. Ensure isTyping is true so
    // the cursor shows and the live region stays quiet while text streams in
    // (e.g. when text changes from "Processing request..." to the response).
    setIsTyping(true);
    let currentIndex = 0;
    const typingSpeed = 10; // Slightly slower for better scroll compatibility
    const typingInterval = setInterval(() => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.slice(0, currentIndex));
        currentIndex++;

        // Notify parent component about typing updates for auto-scroll
        if (onTypingUpdate) {
          onTypingUpdate();
        }
      } else {
        markAnimationCompleted(animationKey);
        setIsTyping(false);
        clearInterval(typingInterval);
      }
    }, typingSpeed);

    return () => clearInterval(typingInterval);
  }, [text, isUser, inIframe, messageId]);

  return (
    <Box style={containerStyle}>
      {/* Visual typing effect for users */}
      <div className={`chat-message-content ${isUser ? 'user' : ''}`}>
        <ReactMarkdown
          rehypePlugins={[
            // Before rehypeSanitize, so KaTeX's own markup goes through the
            // allowlist rather than around it.
            ...mathPlugins,
            [rehypeSanitize, SANITIZE_SCHEMA],
          ]}
          remarkPlugins={[remarkGfm, remarkMath]}
          components={{
            pre: ({ node, ...props }) => (
              <pre {...props} role="text" aria-label="Code block" />
            ),
            // Fall back rather than overwrite, the way the `img` override
            // below already does. A prop after a spread wins unconditionally,
            // so this used to discard any `aria-label` the pipeline had set —
            // and the one case that has one is the footnote backref, whose
            // visible text is a bare return arrow. It announced as "Link: ↩"
            // in place of "Back to reference 1".
            a: ({ node, ...props }) => (
              <a {...props} aria-label={props['aria-label'] ?? `Link: ${props.children}`} />
            ),
            img: ({ node, ...props }) => (
              <img {...props} alt={props.alt || 'Image in message'} />
            ),
          }}
        >
          {displayedText}
        </ReactMarkdown>
      </div>
      {/* Visually hidden live region for screen readers */}
      <div
        className="sr-only"
        aria-live={settings.general.ariaMode}
        aria-atomic="true"
      >
        {isTyping ? '' : text}
      </div>
      {isTyping && !inIframe && (
        <span
          className="typing-cursor"
          aria-hidden="true"
          role="presentation"
        >
          |
        </span>
      )}
    </Box>
  );
});

TypingEffect.displayName = 'TypingEffect';
