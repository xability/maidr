import { Close, Send } from '@mui/icons-material';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { useViewModel, useViewModelState } from '@state/hook/useViewModel';
import React, { useEffect, useId, useRef, useState } from 'react';
import { MessageBubble } from '../components/MessageBubble';

const Chat: React.FC = () => {
  const id = useId();
  const theme = useTheme();

  const viewModel = useViewModel('chat');
  const settingsViewModel = useViewModel('settings');
  const { messages } = useViewModelState('chat');
  const disabled = !viewModel.canSend;

  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleOpenSettings = (): void => {
    settingsViewModel.toggle();
  };

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
      id={id}
      role="dialog"
      open={true}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      disablePortal
      sx={{
        '& .MuiDialog-paper': {
          height: '70vh',
          maxHeight: '90vh',
        },
      }}
    >
      <DialogTitle>
        <Grid container justifyContent="space-between" alignItems="center">
          <Grid size="auto">
            <Typography variant="h6" fontWeight="bold">
              Chart Assistant
            </Typography>
          </Grid>
          <Grid size="auto">
            <IconButton
              onClick={handleClose}
              aria-label="Close"
            >
              <Close />
            </IconButton>
          </Grid>
        </Grid>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, overflow: 'hidden' }}>
        <Grid container direction="column" sx={{ height: '100%' }}>
          {/* Messages Container */}
          <Grid
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
              <MessageBubble
                key={message.id}
                message={message}
                _disabled={disabled}
                _onOpenSettings={handleOpenSettings}
              />
            ))}
            <div ref={messagesEndRef} />
          </Grid>

          {/* Input Container */}
          <Grid
            size={12}
            sx={{
              p: 2,
              borderTop: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Grid container spacing={1} alignItems="center">
              <Grid size={{ xs: 10 }}>
                <TextField
                  value={inputMessage}
                  disabled={disabled}
                  onChange={e => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  maxRows={4}
                  placeholder="Type your message..."
                  variant="outlined"
                  size="small"
                  autoFocus
                  fullWidth
                  multiline
                />
              </Grid>
              <Grid size={{ xs: 2 }} container justifyContent="flex-end">
                <IconButton
                  onClick={handleSend}
                  disabled={disabled}
                  color="primary"
                  aria-label="Send message"
                  sx={{
                    'bgcolor': theme.palette.primary.main,
                    'color': theme.palette.primary.contrastText,
                    '&:hover': {
                      bgcolor: theme.palette.primary.dark,
                    },
                  }}
                >
                  <Send />
                </IconButton>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default Chat;
