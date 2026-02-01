'use client';

import { cn } from '@/lib/utils';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  return (
    <div
      className={cn(
        'flex gap-3 p-4 rounded-lg',
        role === 'user' ? 'bg-muted/50' : 'bg-background'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-white text-black'
        )}
      >
        {role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <p className="text-sm font-medium">
          {role === 'user' ? 'You' : 'Syntra AI'}
        </p>
        <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {content}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-foreground/50 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}
