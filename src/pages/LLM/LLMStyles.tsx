import {Box, Paper, styled} from '@mui/material';

export const InputContainer = styled(Box)({
  padding: '20px',
  borderTop: '1px solid rgba(0, 0, 0, 0.1)',
});

export const MessagesContainer = styled(Box)({
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

export interface MessageBubbleProps {
  isUser: boolean;
}

export const MessageBubble = styled(Box)<MessageBubbleProps>(({isUser}) => ({
  display: 'flex',
  alignItems: 'flex-start',
  marginBottom: '16px',
  flexDirection: isUser ? 'row-reverse' : 'row',
}));

export const MessageContent = styled(Paper)<MessageBubbleProps>(({isUser}) => ({
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
