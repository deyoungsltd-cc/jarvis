'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Trash2, Bot, User, AlertCircle, Settings, Zap } from 'lucide-react';
import { streamChat } from '@/lib/openjarvis-api';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ModelInfo {
  model: string;
  provider: string;
  name: string;
  uncensored: boolean;
}

export function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // Fetch model info on mount
  useEffect(() => {
    fetch('/api/agent/chat')
      .then(r => r.ok ? r.json() : null)
      .then(setModelInfo)
      .catch(() => {});
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    try {
      const chatHistory = [...messages, userMsg].filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const response = await streamChat(chatHistory);
      abortRef.current = new AbortController();

      const reader = response.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: fullContent }
              : m
          )
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Failed to get response';
      setError(msg);
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMsg.id || m.content !== ''));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const needsApiKey = error?.includes('OPENROUTER_API_KEY') || error?.includes('401') || error?.includes('403');

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 break-all">{needsApiKey ? 'OPENROUTER_API_KEY not set. Add it in Settings tab.' : error}</span>
          {needsApiKey && <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0 gap-1" onClick={() => {}}><Settings className="h-3 w-3" />Settings</Button>}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="flex flex-col gap-4 p-1 min-h-full">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-muted-foreground">
              <div className="relative">
                <Bot className="h-12 w-12 opacity-40" />
                <Zap className="h-4 w-4 absolute -top-1 -right-1 text-emerald-500" />
              </div>
              <p className="text-sm font-medium">Qween — Uncensored AI</p>
              {modelInfo && (
                <div className="flex flex-col items-center gap-1">
                  <Badge variant="outline" className="text-[10px] font-mono gap-1">
                    <Zap className="h-2.5 w-2.5 text-emerald-500" />
                    {modelInfo.model}
                  </Badge>
                  <p className="text-[10px] opacity-50">Zero guardrails · Zero refusals · Fully unrestricted</p>
                </div>
              )}
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <Avatar className="h-7 w-7 shrink-0 mt-1">
                  <AvatarFallback className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">Q</AvatarFallback>
                </Avatar>
              )}
              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted border border-border'
              }`}>
                <div className="whitespace-pre-wrap break-words">{msg.content || (streaming ? '▌' : '')}</div>
              </div>
              {msg.role === 'user' && (
                <Avatar className="h-7 w-7 shrink-0 mt-1">
                  <AvatarFallback className="bg-primary/20 text-primary text-xs"><User className="h-3.5 w-3.5" /></AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          {streaming && messages[messages.length - 1]?.content === '' && (
            <div className="flex gap-3">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">Q</AvatarFallback>
              </Avatar>
              <div className="bg-muted border border-border rounded-xl px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="flex gap-2 items-end">
        {messages.length > 0 && (
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={handleClear} title="Clear chat">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Qween anything..."
            className="min-h-[44px] max-h-[120px] pr-12 resize-none text-sm"
            rows={1}
            disabled={streaming}
          />
        </div>
        {streaming ? (
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={handleStop} title="Stop">
            <div className="h-3 w-3 rounded-full bg-destructive" />
          </Button>
        ) : (
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!input.trim()} title="Send">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center justify-center gap-2">
        {modelInfo && (
          <Badge variant="secondary" className="text-[9px] font-mono gap-1 h-5">
            <Zap className="h-2.5 w-2.5 text-emerald-500" />
            {modelInfo.name} · {modelInfo.uncensored ? 'Uncensored' : 'Filtered'}
          </Badge>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground text-center">Enter to send · Shift+Enter for newline</p>
    </div>
  );
}
