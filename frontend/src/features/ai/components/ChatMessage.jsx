// frontend/src/features/ai/components/ChatMessage.jsx
import React from 'react';
import { User, Sparkles, Clock, Zap } from 'lucide-react';
import EvidenceDrawer from './EvidenceDrawer.jsx';

/**
 * Format markdown content into basic HTML elements safely.
 */
function renderMarkdown(content) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let inList = false;
  let listItems = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-5 my-2 space-y-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-surface-800 leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const formatInline = (text) => {
    // Replace **bold**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-surface-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={index} className="text-sm font-bold text-surface-900 mt-4 mb-2 tracking-tight">
          {formatInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={index} className="text-base font-bold text-surface-900 mt-5 mb-2.5 tracking-tight border-b border-surface-100 pb-1">
          {formatInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={index} className="text-lg font-bold text-surface-900 mt-6 mb-3 tracking-tight">
          {formatInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(trimmed.slice(2));
      return;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      flushList();
      elements.push(
        <div key={index} className="flex items-start gap-2 my-1 text-surface-800 leading-relaxed">
          <span className="font-semibold text-brand-600 min-w-5">{numMatch[1]}.</span>
          <div>{formatInline(numMatch[2])}</div>
        </div>
      );
      return;
    }

    // Empty line
    if (!trimmed) {
      flushList();
      return;
    }

    // Standard paragraph
    flushList();
    elements.push(
      <p key={index} className="my-2 text-surface-800 leading-relaxed text-sm">
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList();
  return elements;
}

export default function ChatMessage({ message, isStreaming = false }) {
  const isUser = message.role === 'USER' || message.role === 'user';

  return (
    <div className={`py-4 px-4 sm:px-6 transition-colors ${isUser ? 'bg-surface-50/60' : 'bg-white'}`}>
      <div className="max-w-4xl mx-auto flex items-start gap-3.5">
        {/* Avatar */}
        <div className="flex-shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-8 h-8 rounded-full bg-surface-200 border border-surface-300 flex items-center justify-center text-surface-700">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-600 text-white shadow-xs flex items-center justify-center font-bold text-xs">
              <Sparkles className="w-4 h-4 text-brand-200" />
            </div>
          )}
        </div>

        {/* Message Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-surface-900">
              {isUser ? 'You' : 'Missive SEO Analyst'}
            </span>
            <div className="flex items-center gap-2.5 text-3xs text-surface-400">
              {message.durationMs && (
                <span className="inline-flex items-center gap-0.5" title="Inference Duration">
                  <Clock className="w-3 h-3" />
                  {(message.durationMs / 1000).toFixed(1)}s
                </span>
              )}
              {message.tokensUsed && (
                <span className="inline-flex items-center gap-0.5" title="Tokens Evaluated">
                  <Zap className="w-3 h-3" />
                  {message.tokensUsed} tokens
                </span>
              )}
              {message.createdAt && (
                <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>
          </div>

          <div className="prose prose-sm max-w-none text-surface-800">
            {renderMarkdown(message.content)}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-brand-500 animate-pulse ml-0.5 align-middle" />
            )}
          </div>

          {/* Evidence Drawer for Assistant replies */}
          {!isUser && message.toolsUsed && (
            <EvidenceDrawer evidence={message.toolsUsed} />
          )}
        </div>
      </div>
    </div>
  );
}
