import type { Message } from '@type/llm';
import { AccountCircle as AccountCircleIcon, Close, Send as SendIcon, SmartToy } from '@mui/icons-material';
import { Avatar, Box, CircularProgress, Dialog, DialogContent, DialogTitle, Grid2, IconButton, TextField, Typography, useTheme } from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useRef, useState } from 'react';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: message.isUser ? 'flex-end' : 'flex-start',
        mb: 2,
      }}
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
          sx={{
            bgcolor: message.isUser
              ? theme.palette.primary.main
              : theme.palette.grey[500],
          }}
        >
          {message.isUser ? <AccountCircleIcon /> : <SmartToy fontSize="small" />}
        </Avatar>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: message.isUser
              ? theme.palette.primary.light
              : theme.palette.background.paper,
            border: `1px solid ${message.isUser
              ? theme.palette.primary.main
              : theme.palette.divider
            }`,
            position: 'relative',
          }}
        >
          {!message.isUser && (
            <Typography
              variant="caption"
              fontWeight="medium"
              color="text.secondary"
              gutterBottom
            >
              {message.model || 'AI Assistant'}
            </Typography>
          )}
          <Typography
            variant="body1"
            color={message.isUser ? 'primary.contrastText' : 'text.primary'}
            sx={{ whiteSpace: 'pre-wrap' }}
          >
            {message.text}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 0.5, textAlign: 'right' }}
          >
            {new Date(message.timestamp).toLocaleTimeString()}
          </Typography>

          {/* Status Indicator */}
          {!message.isUser && message.status === 'PENDING' && (
            <Box>
              <CircularProgress size={16} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

const Chat: React.FC = () => {
  const theme = useTheme();

  const viewModel = useViewModel('chat');
  const { enabled, messages } = useViewModelState('chat');
  const settings = useViewModelState('settings');

  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAnyAgentEnabled = Object.values(settings.llm.models).some(model => model.enabled && model.apiKey);

  useEffect(() => {
    if (enabled && !isAnyAgentEnabled) {
      viewModel.addMessage('No agents are enabled. Please enable at least one agent in the settings page.');
    }
  }, [enabled, isAnyAgentEnabled]);

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleClose = (): void => {
    viewModel.toggle();
  };

  const handleSend = (): void => {
    if (!isAnyAgentEnabled) {
      viewModel.addMessage('No agents are enabled. Please enable at least one agent in the settings page.');
      return;
    }
    if (inputMessage.trim()) {
      void viewModel.sendMessage(inputMessage);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog
      role="dialog"
      open={enabled}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disablePortal
      closeAfterTransition={false}
      sx={{
        '& .MuiDialog-paper': {
          height: '70vh',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle>
        <Grid2 container justifyContent="space-between" alignItems="center">
          <Grid2 size="auto">
            <Typography variant="h6" fontWeight="bold">
              Chart Assistant
            </Typography>
          </Grid2>
          <Grid2 size="auto">
            <IconButton
              onClick={handleClose}
              aria-label="Close"
            >
              <Close />
            </IconButton>
          </Grid2>
        </Grid2>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, overflow: 'hidden' }}>
        <Grid2 container direction="column" sx={{ height: '100%' }}>
          {/* Messages Container */}
          <Grid2
            size={12}
            sx={{
              'flex': 1,
              'overflowY': 'auto',
              'p': 2,
              'bgcolor': theme.palette.background.default,
              '&::-webkit-scrollbar': {
                width: '6px',
              },
              '&::-webkit-scrollbar-track': {
                background: theme.palette.grey[100],
              },
              '&::-webkit-scrollbar-thumb': {
                background: theme.palette.grey[400],
                borderRadius: '3px',
              },
            }}
          >
            {messages.map(message => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </Grid2>

          {/* Input Container */}
          <Grid2
            size={12}
            sx={{
              p: 2,
              borderTop: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Grid2 container spacing={1} alignItems="center">
              <Grid2 size={{ xs: 10 }}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={4}
                  value={inputMessage}
                  onChange={e => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={isAnyAgentEnabled ? 'Type your message...' : 'Enable at least one agent in settings to chat'}
                  variant="outlined"
                  size="small"
                  autoFocus
                  disabled={!isAnyAgentEnabled}
                />
              </Grid2>
              <Grid2 size={{ xs: 2 }} container justifyContent="flex-end">
                <IconButton
                  onClick={handleSend}
                  color="primary"
                  aria-label="Send message"
                  sx={{
                    'bgcolor': theme.palette.primary.main,
                    'color': theme.palette.primary.contrastText,
                    '&:hover': {
                      bgcolor: theme.palette.primary.dark,
                    },
                  }}
                  disabled={!isAnyAgentEnabled}
                >
                  <SendIcon />
                </IconButton>
              </Grid2>
            </Grid2>
          </Grid2>
        </Grid2>
      </DialogContent>
    </Dialog>
  );
};

export default Chat;
