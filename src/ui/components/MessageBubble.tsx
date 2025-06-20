import type { Message } from '@type/llm';
import { AccountCircle, SmartToy } from '@mui/icons-material';
import { Avatar, Box, CircularProgress, Typography } from '@mui/material';
import React from 'react';
import { TypingEffect } from './TypingEffect';

interface MessageBubbleProps {
  message: Message;
  _disabled?: boolean;
  _onOpenSettings?: () => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, _disabled, _onOpenSettings }) => {
  const getLLMAvatar = (): React.ReactElement => {
    return message.isUser ? <AccountCircle /> : <SmartToy fontSize="small" />;
  };

  const getAriaLabel = (): string => {
    const role = message.isUser ? 'Your message' : 'AI Assistant message';
    const model = !message.isUser ? ` from ${message.model || 'AI Assistant'}` : '';
    const status = !message.isUser && message.status === 'PENDING' ? ' (typing)' : '';
    return `${role}${model}${status}`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: message.isUser ? 'flex-end' : 'flex-start',
        mb: 2,
      }}
      role="listitem"
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          maxWidth: '80%',
          flexDirection: message.isUser ? 'row-reverse' : 'row',
        }}
      >
        <Avatar
          className={`chat-avatar ${message.isUser ? 'user' : ''}`}
          aria-hidden="true"
        >
          {getLLMAvatar()}
        </Avatar>

        <Box
          className={`chat-bubble ${message.isUser ? 'user' : 'ai'}`}
          role="article"
          aria-label={getAriaLabel()}
        >
          {!message.isUser && (
            <Typography
              className="model-name"
              variant="caption"
              fontWeight="medium"
              color="text.secondary"
              component="div"
              aria-label={`Model: ${message.model || 'AI Assistant'}`}
            >
              {message.model || 'AI Assistant'}
            </Typography>
          )}
          <TypingEffect text={message.text} isUser={message.isUser} />
          <Typography
            className="timestamp"
            variant="caption"
            color="text.secondary"
            component="time"
            dateTime={new Date(message.timestamp).toISOString()}
            aria-label={`Sent at ${new Date(message.timestamp).toLocaleTimeString()}`}
          >
            {new Date(message.timestamp).toLocaleTimeString()}
          </Typography>

          {!message.isUser && message.status === 'PENDING' && (
            <Box
              role="status"
              aria-label="AI is typing"
            >
              <CircularProgress size={16} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
