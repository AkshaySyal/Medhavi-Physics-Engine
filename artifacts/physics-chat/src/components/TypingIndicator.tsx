export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3" data-testid="typing-indicator">
      <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
      <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
      <div className="w-2 h-2 rounded-full bg-primary typing-dot" />
    </div>
  );
}
