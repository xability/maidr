import type { Message } from '@type/llm';
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
import { Suggestions } from '../components/Suggestions';

const Chat: React.FC = () => {
  const id = useId();
  const theme = useTheme();

  const viewModel = useViewModel('chat');
  const settingsViewModel = useViewModel('settings');
  const { messages, suggestions } = useViewModelState('chat');
  const disabled = !viewModel.canSend;

  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollHeightRef = useRef<number>(0);
  const mutationObserverRef = useRef<MutationObserver | null>(null);

  const handleOpenSettings = (): void => {
    settingsViewModel.toggle();
  };

  const scrollToBottom = (force = false): void => {
    if (!messagesContainerRef.current)
      return;

    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;

    // Only auto-scroll if user is near bottom or if forced
    if (isNearBottom || force) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      });
    }
  };

  // Auto-scroll when new messages are added or existing messages are updated
  useEffect(() => {
    // Always scroll when messages change
    const timeoutId = setTimeout(() => {
      scrollToBottom(true); // Force scroll for message changes
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [messages.length]); // Only trigger on message count changes

  // Auto-scroll when chat is first opened
  useEffect(() => {
    // Initial scroll to bottom when component mounts
    setTimeout(() => scrollToBottom(true), 200);
  }, []); // Empty dependency array means this runs only on mount

  // Set up MutationObserver for auto-scroll during typing animation
  useEffect(() => {
    if (!messagesContainerRef.current)
      return;

    const container = messagesContainerRef.current;

    // Clean up existing observer
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
    }

    // Create new observer to watch for text content changes
    mutationObserverRef.current = new MutationObserver((mutations) => {
      let shouldScroll = false;

      mutations.forEach((mutation) => {
        // Check if text content changed (typing animation)
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
          if (isNearBottom) {
            shouldScroll = true;
          }
        }
      });

      if (shouldScroll) {
        // Use immediate scroll for typing animation
        requestAnimationFrame(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'auto',
          });
        });
      }
    });

    // Start observing
    mutationObserverRef.current.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Cleanup
    return () => {
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
      }
    };
  }, [messages.length]); // Re-setup when message count changes

  // Monitor content height changes for auto-scroll during typing
  useEffect(() => {
    if (!messagesContainerRef.current)
      return;

    const container = messagesContainerRef.current;
    const currentHeight = container.scrollHeight;

    // If content height increased and we were near bottom, scroll
    if (currentHeight > lastScrollHeightRef.current) {
      const isNearBottom = container.scrollTop + container.clientHeight >= lastScrollHeightRef.current - 100;
      if (isNearBottom) {
        // Immediate scroll for typing animation - no debouncing
        requestAnimationFrame(() => {
          container.scrollTo({
            top: currentHeight,
            behavior: 'auto', // Use 'auto' for immediate scroll during typing
          });
        });
      }
    }

    lastScrollHeightRef.current = currentHeight;
  }, [messages]); // Trigger when messages change (including typing updates)

  // Auto-scroll when message content changes (for updates like "Processing..." -> actual response)
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];

      // Only scroll for status changes or when typing is complete, not during typing
      if (lastMessage.status === 'SUCCESS' || lastMessage.status === 'FAILED') {
        const timeoutId = setTimeout(() => {
          scrollToBottom(true); // Force scroll for completed messages
        }, 300); // Longer delay to let typing finish

        return () => clearTimeout(timeoutId);
      }
    }
  }, [messages.length > 0 ? messages[messages.length - 1]?.status : '']);

  const handleClose = (): void => {
    viewModel.toggle();
  };

  const handleSend = (): void => {
    if (inputMessage.trim()) {
      void viewModel.sendMessage(inputMessage);
      setInputMessage('');
      // Auto-scroll after sending message (force scroll)
      setTimeout(() => scrollToBottom(true), 100);
    }
  };

  const handleSuggestionClick = (suggestion: { text: string; type: string }): void => {
    setInputMessage(suggestion.text);
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
      <DialogTitle component="h2" sx={{ p: 2 }}>
        <Grid container justifyContent="space-between" alignItems="center">
          <Grid size="auto">
            <Typography
              variant="h6"
              fontWeight="bold"
              component="h2"
              sx={{ margin: 0 }}
              aria-label="Chart Assistant - AI Chat Interface"
            >
              Chart Assistant
            </Typography>
          </Grid>
          <Grid size="auto">
            <IconButton
              onClick={handleClose}
              aria-label="Close chat dialog"
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
            ref={messagesContainerRef}
            size={12}
            component="section"
            aria-label="Chat messages"
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
            {messages.map((message: Message) => (
              <MessageBubble
                key={message.id}
                message={message}
                disabled={disabled}
                _onOpenSettings={handleOpenSettings}
                onTypingUpdate={() => {
                  // Auto-scroll during typing animation
                  if (messagesContainerRef.current) {
                    const container = messagesContainerRef.current;
                    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 100;
                    if (isNearBottom) {
                      requestAnimationFrame(() => {
                        container.scrollTo({
                          top: container.scrollHeight,
                          behavior: 'auto',
                        });
                      });
                    }
                  }
                }}
              />
            ))}
            <div ref={messagesEndRef} />
          </Grid>

          {/* Suggestions */}
          <Suggestions
            suggestions={suggestions}
            onSuggestionClick={handleSuggestionClick}
          />

          {/* Input Container */}
          <Grid
            size={12}
            component="section"
            aria-label="Message input"
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
                  placeholder="What can I help you with?"
                  variant="outlined"
                  size="small"
                  autoFocus
                  fullWidth
                  multiline
                  aria-label="Type your message to the AI assistant"
                />
              </Grid>
              <Grid size={{ xs: 2 }} container justifyContent="flex-end">
                <IconButton
                  onClick={handleSend}
                  disabled={disabled}
                  color="primary"
                  aria-label="Send message to AI assistant"
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
