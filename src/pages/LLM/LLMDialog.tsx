import React, {useEffect, useRef, useState} from 'react';
import {
  Avatar,
  Box,
  Container,
  Dialog,
  IconButton,
  Paper,
  Stack,
  styled,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import {useLLM} from './LLMProvider';
import {
  getAPIKeyFromConfiguration,
  Message,
  modelStringToPrettyString,
  stringToLLMEnum,
} from '../types/LLMTypes';
import {useConfiguration} from '../Configuration/ConfigurationProvider';

const InputContainer = styled(Box)({
  padding: '20px',
  borderTop: '1px solid rgba(0, 0, 0, 0.1)',
});

const MessagesContainer = styled(Box)({
  flex: 1,
  padding: '20px',
  '&::-webkit-scrollbar': {
    width: '6px',
  },
  '&::-webkit-scrollbar-track': {
    background: '#f1f1f1',
  },
  '&::-webkit-scrollbar-thumb': {
    background: '#888',
    borderRadius: '3px',
  },
  height: '500px',
  overflowY: 'auto',
});

interface MessageBubbleProps {
  isUser: boolean;
}

const MessageBubble = styled(Box)<MessageBubbleProps>(({isUser}) => ({
  display: 'flex',
  alignItems: 'flex-start',
  marginBottom: '16px',
  flexDirection: isUser ? 'row-reverse' : 'row',
}));

const MessageContent = styled(Paper)<MessageBubbleProps>(({isUser}) => ({
  padding: '12px 16px',
  borderRadius: '16px',
  maxWidth: '70%',
  marginLeft: isUser ? 0 : '12px',
  marginRight: isUser ? '12px' : 0,
  backgroundColor: isUser ? '#2196f3' : '#f5f5f5',
  color: isUser ? '#fff' : '#000',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    transform: 'scale(1.02)',
  },
}));

export const LLMDialog: React.FC = () => {
  const [open, setOpen] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  // const [isLoading, setIsLoading] = useState(false);
  const {sendMessage} = useLLM();
  const {config} = useConfiguration();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const textFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (textFieldRef.current) {
      textFieldRef.current.focus();
    }
  }, []);

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleClose = (): void => {
    setOpen(false);
  };

  const handleSendMessage = (): void => {
    const models = config.models;
    const currentTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const userMessage = {
      id: messages.length + 1,
      text: newMessage,
      isUser: true,
      timestamp: currentTime,
    };
    setMessages((prevMessages: Message[]) => [...prevMessages, userMessage]);

    for (const [key, value] of Object.entries(models)) {
      const model = stringToLLMEnum(key);
      if (value) {
        if (newMessage.trim()) {
          sendMessage(
            model,
            newMessage,
            config.clientToken !== '' ? true : false,
            getAPIKeyFromConfiguration(model, config)
          )
            .then(response => {
              if (
                response !== null &&
                response !== undefined &&
                response.trim() !== ''
              ) {
                const currentTime = new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const responseMessagae = {
                  id: messages.length + 1,
                  text: response,
                  isUser: false,
                  model: model,
                  timestamp: currentTime,
                };
                setMessages((prevMessages: Message[]) => [
                  ...prevMessages,
                  responseMessagae,
                ]);
              }
            })
            .catch(error => {
              alert('Error sending message: ' + error);
            });
        }
      }
    }
    setNewMessage('');
  };

  const handleKeyPress = (e: {
    key: string;
    shiftKey: boolean;
    preventDefault: () => void;
  }): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div>
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <Container>
          <MessagesContainer>
            {messages.length === 0 && (
              <Box
                display="flex"
                justifyContent="center"
                alignItems="center"
                width="100%"
                height="100%"
              >
                <SmartToyIcon fontSize="large" style={{marginInline: '20px'}} />
                <Typography variant="h4" fontWeight={300} color="textSecondary">
                  What can I help with?
                </Typography>
              </Box>
            )}
            {messages.map(message => (
              <MessageBubble key={message.id} isUser={message.isUser}>
                <Avatar
                  alt={message.isUser ? 'User' : 'Contact'}
                  sx={{
                    width: 40,
                    height: 40,
                  }}
                >
                  {message.isUser ? <AccountCircleIcon /> : <SmartToyIcon />}
                </Avatar>
                <MessageContent isUser={message.isUser}>
                  {!message.isUser && (
                    <Typography variant="h6" component="div">
                      {modelStringToPrettyString(
                        message.model ?? 'Unknown Model'
                      )}
                    </Typography>
                  )}
                  <Typography variant="body1" component="div">
                    {message.text}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{opacity: 0.7, mt: 0.5, display: 'block'}}
                  >
                    {message.timestamp}
                  </Typography>
                </MessageContent>
              </MessageBubble>
            ))}
            <div ref={messagesEndRef} />
          </MessagesContainer>
          <InputContainer>
            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                multiline
                maxRows={4}
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                variant="outlined"
                size="small"
                sx={{backgroundColor: '#fff'}}
                aria-label="Message input field"
                inputRef={textFieldRef}
                autoFocus
              />
              <IconButton
                onClick={handleSendMessage}
                color="primary"
                aria-label="Send message"
                sx={{
                  backgroundColor: '#2196f3',
                  color: '#fff',
                  height: '40px',
                  '&:hover': {
                    backgroundColor: '#1976d2',
                  },
                }}
              >
                <SendIcon />
              </IconButton>
            </Stack>
          </InputContainer>
        </Container>
      </Dialog>
    </div>
  );
};
