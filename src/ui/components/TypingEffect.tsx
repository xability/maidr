import { Box } from '@mui/material';
import { useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

interface TypingEffectProps {
  text: string;
  isUser: boolean;
  onTypingUpdate?: () => void;
}

export const TypingEffect: React.FC<TypingEffectProps> = ({ text, isUser, onTypingUpdate }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const messageRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (isUser || inIframe) {
      setDisplayedText(text);
      setIsTyping(false);
      return;
    }

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
        setIsTyping(false);
        clearInterval(typingInterval);
      }
    }, typingSpeed);

    return () => clearInterval(typingInterval);
  }, [text, isUser, inIframe]);

  useEffect(() => {
    if (!isTyping && messageRef.current) {
      const messageContent = messageRef.current.textContent || '';
      messageRef.current.setAttribute('aria-label', `AI message: ${messageContent}`);
    }
  }, [isTyping]);

  return (
    <Box style={containerStyle}>
      {/* Visual typing effect for users */}
      <div className={`chat-message-content ${isUser ? 'user' : ''}`}>
        <ReactMarkdown
          rehypePlugins={[
            rehypeKatex,
            [rehypeSanitize, {
              attributes: {
                '*': ['className', 'aria-label', 'aria-hidden', 'role', 'aria-busy', 'aria-live', 'aria-atomic'],
                'a': ['href', 'target'],
                'img': ['src', 'alt'],
                'math': ['display'],
                'span': ['style'],
                'svg': ['aria-hidden', 'role', 'xmlns', 'width', 'height', 'viewBox'],
                'path': ['d'],
              },
              tagNames: [
                'p',
                'br',
                'b',
                'i',
                'em',
                'strong',
                'a',
                'pre',
                'code',
                'ul',
                'ol',
                'li',
                'blockquote',
                'img',
                'math',
                'span',
                'svg',
                'path',
              ],
            }],
          ]}
          remarkPlugins={[remarkGfm, remarkMath]}
          components={{
            pre: ({ node, ...props }) => (
              <pre {...props} role="text" aria-label="Code block" />
            ),
            a: ({ node, ...props }) => (
              <a {...props} aria-label={`Link: ${props.children}`} />
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
};
