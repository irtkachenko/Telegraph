# Optimistic UI Updates Guide

This guide explains how to implement optimistic UI updates using the new client-side UUID validation system.

## Overview

With the new validation architecture, clients generate UUIDs before calling server actions. This enables:
- **Idempotency**: Prevents duplicate messages during network issues
- **Optimistic UI**: Immediate UI updates without waiting for server response
- **Better UX**: Users see their messages instantly

## Implementation Steps

### 1. Generate UUID on Client Side

```typescript
// Before calling the server action
const messageId = crypto.randomUUID();

const messageData = {
  id: messageId, // Client-generated UUID
  chatId: currentChatId,
  content: messageText,
  attachments: uploadedAttachments,
};
```

### 2. Optimistic Update Pattern

```typescript
import { sendMessageAction } from '@/actions/chat-actions';
import { useMutation, useQueryClient } from '@tanstack/react-query';

// In your component
const queryClient = useQueryClient();

const sendMessageMutation = useMutation({
  mutationFn: sendMessageAction,
  onMutate: async (newMessage) => {
    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['messages', newMessage.chatId] });
    
    // Snapshot the previous value
    const previousMessages = queryClient.getQueryData(['messages', newMessage.chatId]);
    
    // Optimistically update to the new value
    queryClient.setQueryData(['messages', newMessage.chatId], (old: any) => [
      ...(old || []),
      {
        ...newMessage,
        created_at: new Date().toISOString(),
        sender_id: currentUser.id,
        is_optimistic: true, // Mark as optimistic
      },
    ]);
    
    return { previousMessages };
  },
  onError: (err, newMessage, context) => {
    // If the mutation fails, roll back to the previous value
    if (context?.previousMessages) {
      queryClient.setQueryData(['messages', newMessage.chatId], context.previousMessages);
    }
    
    // Show error toast
    toast.error('Failed to send message');
  },
  onSettled: (data, error, variables) => {
    // Always refetch after error or success
    queryClient.invalidateQueries({ queryKey: ['messages', variables.chatId] });
  },
  onSuccess: (data) => {
    // Optional: Show success feedback
    toast.success('Message sent');
  },
});

// Usage
const handleSendMessage = () => {
  const messageId = crypto.randomUUID();
  
  sendMessageMutation.mutate({
    id: messageId,
    chatId: currentChatId,
    content: messageText,
    attachments: [],
  });
  
  // Clear input immediately for better UX
  setMessageText('');
};
```

### 3. Handling Optimistic States in UI

```typescript
// Message component with optimistic state handling
const MessageComponent = ({ message }) => {
  const isOptimistic = message.is_optimistic;
  
  return (
    <div className={`message ${isOptimistic ? 'optimistic' : ''}`}>
      <div className="message-content">
        {message.content}
      </div>
      {isOptimistic && (
        <div className="sending-indicator">
          <Spinner size="sm" />
          <span>Sending...</span>
        </div>
      )}
      <MessageTimestamp timestamp={message.created_at} />
    </div>
  );
};
```

### 4. Error Handling with Zod Validation

```typescript
// Enhanced error handling for validation errors
const sendMessageMutation = useMutation({
  mutationFn: sendMessageAction,
  onError: (error) => {
    if (error.details) {
      // Handle Zod validation errors
      const fieldErrors = error.details.fieldErrors;
      
      if (fieldErrors.content) {
        toast.error(`Message error: ${fieldErrors.content[0]}`);
      } else if (fieldErrors.attachments) {
        toast.error(`Attachment error: ${fieldErrors.attachments[0]}`);
      } else {
        toast.error('Validation failed');
      }
    } else {
      // Handle other errors
      switch (error.error) {
        case 'UNAUTHORIZED':
          toast.error('Please log in to send messages');
          break;
        case 'FORBIDDEN':
          toast.error('You cannot send messages in this chat');
          break;
        default:
          toast.error('Failed to send message');
      }
    }
  },
});
```

### 5. Network Retry Logic

```typescript
// Automatic retry for network failures
const sendMessageMutation = useMutation({
  mutationFn: sendMessageAction,
  retry: (failureCount, error) => {
    // Only retry on network errors, not validation errors
    if (error.error === 'INTERNAL_ERROR' && failureCount < 3) {
      return true;
    }
    return false;
  },
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
});
```

## Best Practices

### 1. Always Generate UUIDs First
```typescript
// ✅ Good - Generate UUID before any async operations
const messageId = crypto.randomUUID();
const messageData = { id: messageId, ... };

// ❌ Bad - Don't wait for anything before generating UUID
const someData = await fetchSomething();
const messageId = crypto.randomUUID(); // Too late
```

### 2. Handle Race Conditions
```typescript
// Use the client-generated ID as the key to prevent duplicates
const messageKey = `message-${messageData.id}`;

// In your optimistic update, use the ID as the key
queryClient.setQueryData(['messages', chatId], (old: any) => {
  const filtered = old?.filter(m => m.id !== messageData.id) || [];
  return [...filtered, { ...messageData, is_optimistic: true }];
});
```

### 3. Clean Up Optimistic Messages
```typescript
// Clean up optimistic messages on component unmount
useEffect(() => {
  return () => {
    queryClient.setQueriesData(
      { queryKey: ['messages'] },
      (old: any) => old?.filter((m: any) => !m.is_optimistic) || []
    );
  };
}, []);
```

### 4. Loading States
```typescript
const isSending = sendMessageMutation.isPending;

return (
  <MessageInput 
    disabled={isSending}
    placeholder={isSending ? "Sending..." : "Type a message..."}
  />
);
```

## Migration from Old System

### Before (Server-generated IDs):
```typescript
// Old way - wait for server response
const response = await sendMessage({ content, chatId });
const messageId = response.data.id; // Server generated
```

### After (Client-generated IDs):
```typescript
// New way - immediate UI update
const messageId = crypto.randomUUID(); // Client generated
optimisticUpdate({ id: messageId, content, chatId });
await sendMessage({ id: messageId, content, chatId });
```

## Benefits

1. **Immediate Feedback**: Users see messages instantly
2. **Network Resilience**: Automatic duplicate prevention
3. **Better UX**: No loading spinners for message sending
4. **Consistency**: Same ID on client and server
5. **Error Recovery**: Easy to roll back failed operations

## Security Considerations

- Server validates all UUIDs using Zod schemas
- Idempotency prevents duplicate message creation
- Authentication is verified server-side for every action
- Chat membership is validated before message insertion
