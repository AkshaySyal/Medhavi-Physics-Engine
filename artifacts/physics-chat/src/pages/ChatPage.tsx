import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon, SendIcon, ChevronRightIcon, AtomIcon, FlaskConicalIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  useListAnthropicConversations,
  getListAnthropicConversationsQueryKey,
  useCreateAnthropicConversation,
  useGetAnthropicConversation,
  getGetAnthropicConversationQueryKey,
  getListAnthropicMessagesQueryKey,
  useDeleteAnthropicConversation,
  useListPhysicsTopics,
} from "@workspace/api-client-react";
import { MessageRenderer } from "@/components/MessageRenderer";
import { TypingIndicator } from "@/components/TypingIndicator";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface StreamingMessage {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: conversations = [] } = useListAnthropicConversations();
  const { data: activeConv } = useGetAnthropicConversation(activeConvId!, {
    query: { enabled: !!activeConvId, queryKey: getGetAnthropicConversationQueryKey(activeConvId!) },
  });
  const { data: topics = [] } = useListPhysicsTopics();
  const createConv = useCreateAnthropicConversation();
  const deleteConv = useDeleteAnthropicConversation();

  const persistedMessages = activeConv?.messages ?? [];

  const allMessages: StreamingMessage[] = streamingMessages.length > 0
    ? streamingMessages
    : persistedMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [allMessages, scrollToBottom]);

  useEffect(() => {
    if (activeConvId) {
      setStreamingMessages([]);
    }
  }, [activeConvId]);

  const handleSend = useCallback(async (message: string, convId?: number) => {
    const targetConvId = convId ?? activeConvId;
    if (!targetConvId || !message.trim() || isStreaming) return;

    const userMsg: StreamingMessage = { role: "user", content: message };
    const assistantMsg: StreamingMessage = { role: "assistant", content: "", isStreaming: true };

    const existing = persistedMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setStreamingMessages([...existing, userMsg, assistantMsg]);
    setIsStreaming(true);
    setInput("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`/api/anthropic/conversations/${targetConvId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              fullContent += data.content;
              setStreamingMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullContent, isStreaming: true };
                return updated;
              });
            }
            if (data.done || data.error) break;
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setStreamingMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "Sorry, there was an error generating the response. Please try again.",
          };
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setStreamingMessages((prev) =>
        prev.map((m) => ({ ...m, isStreaming: false }))
      );
      queryClient.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(targetConvId) });
      queryClient.invalidateQueries({ queryKey: getListAnthropicMessagesQueryKey(targetConvId) });
      queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    }
  }, [activeConvId, isStreaming, persistedMessages, queryClient]);

  const startNewConversation = useCallback(async (initialMessage?: string, topicName?: string) => {
    const title = initialMessage
      ? initialMessage.slice(0, 60) + (initialMessage.length > 60 ? "..." : "")
      : topicName ?? "New Physics Session";

    const conv = await createConv.mutateAsync({ data: { title } });
    queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    setActiveConvId(conv.id);
    setStreamingMessages([]);

    if (initialMessage) {
      setTimeout(() => handleSend(initialMessage, conv.id), 100);
    }
  }, [createConv, handleSend, queryClient]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteConv.mutateAsync({ id });
      if (activeConvId === id) {
        setActiveConvId(null);
        setStreamingMessages([]);
      }
      queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
    } finally {
      setDeletingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (activeConvId) {
        handleSend(input);
      } else if (input.trim()) {
        startNewConversation(input.trim());
      }
    }
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    if (activeConvId) {
      handleSend(input);
    } else {
      startNewConversation(input.trim());
    }
  };

  return (
    <div className="flex h-full bg-background" data-testid="chat-page">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-border bg-sidebar" data-testid="sidebar">
        <button
          className="p-4 flex items-center gap-2 border-b border-sidebar-border w-full text-left hover:bg-sidebar-accent/50 transition-colors"
          onClick={() => setActiveConvId(null)}
          title="Back to home"
          data-testid="button-home"
        >
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <AtomIcon className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-sidebar-foreground">Medhavy</div>
            <div className="text-xs text-muted-foreground">Physics Engine</div>
          </div>
        </button>

        <div className="p-3">
          <Button
            onClick={() => startNewConversation()}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
            data-testid="button-new-session"
          >
            <PlusIcon className="w-4 h-4" />
            New Session
          </Button>
        </div>

        <ScrollArea className="flex-1 px-2">
          <div className="space-y-0.5 pb-4">
            {conversations.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No sessions yet. Start exploring!
              </div>
            )}
            {[...conversations].reverse().map((conv) => (
              <div
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setActiveConvId(conv.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md group flex items-start gap-2 transition-colors cursor-pointer ${
                  activeConvId === conv.id
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
                data-testid={`conv-item-${conv.id}`}
              >
                <FlaskConicalIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-60" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{conv.title}</div>
                  <div className="text-xs opacity-50 mt-0.5">
                    {formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(conv.id, e)}
                  disabled={deletingId === conv.id}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-destructive"
                  data-testid={`button-delete-conv-${conv.id}`}
                >
                  <Trash2Icon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-sidebar-border">
          <div className="text-xs text-muted-foreground text-center">OpenStax University Physics Vol. 1</div>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeConvId ? (
          /* Welcome screen */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-12" data-testid="welcome-screen">
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5">
                  <AtomIcon className="w-7 h-7 text-primary" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  Welcome to Medhavy
                </h1>
                <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
                  Your interactive physics computation assistant. Explore concepts, solve equations,
                  generate plots, and build intuition for the physics in your textbook.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8" data-testid="topic-grid">
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className="border border-border rounded-lg p-4 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-all group"
                    onClick={() => startNewConversation(
                      topic.examplePrompts[0],
                      topic.name
                    )}
                    data-testid={`topic-card-${topic.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-lg">{topic.icon}</div>
                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-sm font-semibold text-foreground mb-1">{topic.name}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{topic.description}</div>
                    <div className="mt-3 text-xs text-primary/70 italic truncate">
                      "{topic.examplePrompts[0]}"
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-center text-xs text-muted-foreground mb-4">
                or start typing below to begin a new session
              </div>
            </div>
          </div>
        ) : (
          /* Chat messages */
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6" data-testid="message-list">
              {allMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.role}-${i}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mr-3 flex-shrink-0 mt-1">
                      <AtomIcon className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary/15 border border-primary/20 text-foreground"
                        : "bg-card border border-border text-foreground/90"
                    }`}
                  >
                    {msg.role === "assistant" && msg.content === "" && msg.isStreaming ? (
                      <TypingIndicator />
                    ) : (
                      msg.role === "assistant"
                        ? <MessageRenderer content={msg.content} />
                        : <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-border bg-background/95 backdrop-blur-sm p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-card border border-border rounded-xl px-4 py-3 focus-within:border-primary/40 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeConvId
                    ? "Ask a question, request a plot, or explore a concept... (Enter to send)"
                    : "Type a question to start a new session..."
                }
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50 max-h-32 overflow-y-auto"
                style={{ lineHeight: "1.5" }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "auto";
                  t.style.height = Math.min(t.scrollHeight, 128) + "px";
                }}
                data-testid="input-message"
              />
              <Button
                onClick={handleSubmit}
                disabled={!input.trim() || isStreaming}
                size="sm"
                className="flex-shrink-0 h-8 w-8 p-0 rounded-lg"
                data-testid="button-send"
              >
                <SendIcon className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2 text-center">
              Supports LaTeX equations, interactive plots, and parameter exploration
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
