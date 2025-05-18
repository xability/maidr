import { Box } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeMathjax from 'rehype-mathjax/svg';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface TypingEffectProps {
  text: string;
  isUser: boolean;
}

export const TypingEffect: React.FC<TypingEffectProps> = ({ text, isUser }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isUser) {
      setDisplayedText(text);
      setIsTyping(false);
      return;
    }

    let currentIndex = 0;
    const typingSpeed = 5;

    const typingInterval = setInterval(() => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.slice(0, currentIndex));
        currentIndex++;
      } else {
        setIsTyping(false);
        clearInterval(typingInterval);
      }
    }, typingSpeed);

    return () => clearInterval(typingInterval);
  }, [text, isUser]);

  useEffect(() => {
    if (!isTyping && messageRef.current) {
      const messageContent = messageRef.current.textContent || '';
      messageRef.current.setAttribute('aria-label', `AI message: ${messageContent}`);
    }
  }, [isTyping]);

  return (
    <Box>
      <div
        ref={messageRef}
        className={`chat-message-content ${isUser ? 'user' : ''}`}
        role="text"
        aria-busy="false"
        aria-live="off"
        aria-atomic="true"
      >
        <ReactMarkdown
          rehypePlugins={[
            rehypeMathjax,
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
      {isTyping && (
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
