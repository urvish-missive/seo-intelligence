// frontend/src/features/ai/components/ChatMessage.jsx
import React from 'react';
import { User, Sparkles, Clock, Zap } from 'lucide-react';
import EvidenceDrawer from './EvidenceDrawer.jsx';

/**
 * Format markdown content into React elements (no raw HTML, so it is XSS-safe).
 * Supports #-###### headings, bullet and numbered lists, tables, **bold**,
 * *italic* and `code`, which is what the local model produces.
 */
function formatInline(text, keyPrefix = '') {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key} className="font-semibold text-surface-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key} className="px-1 py-0.5 rounded bg-surface-100 text-[0.85em] font-mono">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

const HEADING_CLASSES = {
  1: 'text-lg font-bold text-surface-900 mt-6 mb-3 tracking-tight',
  2: 'text-base font-bold text-surface-900 mt-5 mb-2.5 tracking-tight border-b border-surface-100 pb-1',
  3: 'text-sm font-bold text-surface-900 mt-4 mb-2 tracking-tight',
  4: 'text-sm font-semibold text-surface-900 mt-3 mb-1.5',
};

const isTableRow = (t) => t.startsWith('|') && t.endsWith('|') && t.length > 2;
const isTableDivider = (t) => /^\|?[\s:|-]+\|?$/.test(t) && t.includes('-');
const splitRow = (t) => t.slice(1, -1).split('|').map((c) => c.trim());

function renderMarkdown(content) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let listItems = [];
  let listType = null; // 'ul' | 'ol'
  let tableRows = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const key = `list-${elements.length}`;
    const items = listItems.map((item, idx) => (
      <li key={idx} className="text-surface-800 leading-relaxed">{formatInline(item, `${key}-${idx}-`)}</li>
    ));
    elements.push(
      listType === 'ol' ? (
        <ol key={key} className="list-decimal pl-5 my-2 space-y-1 marker:text-brand-600 marker:font-semibold">{items}</ol>
      ) : (
        <ul key={key} className="list-disc pl-5 my-2 space-y-1">{items}</ul>
      )
    );
    listItems = [];
    listType = null;
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const [header, ...body] = tableRows;
    const key = `table-${elements.length}`;
    elements.push(
      <div key={key} className="my-3 overflow-x-auto">
        <table className="w-full text-xs border border-surface-200 rounded-lg">
          <thead className="bg-surface-50">
            <tr>
              {header.map((h, i) => (
                <th key={i} className="px-2.5 py-1.5 text-left font-semibold text-surface-700 border-b border-surface-200">{formatInline(h, `${key}-h${i}-`)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((c, i) => (
                  <td key={i} className="px-2.5 py-1.5 text-surface-800">{formatInline(c, `${key}-${r}-${i}-`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Tables
    if (isTableRow(trimmed)) {
      flushList();
      if (!isTableDivider(trimmed)) tableRows.push(splitRow(trimmed));
      return;
    }
    flushTable();

    // Headings (# to ######)
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 4);
      const Tag = `h${Math.min(level + 1, 6)}`;
      elements.push(
        <Tag key={index} className={HEADING_CLASSES[level]}>{formatInline(heading[2], `h${index}-`)}</Tag>
      );
      return;
    }

    // Bullet points
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(bullet[1]);
      return;
    }

    // Numbered list
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(numbered[1]);
      return;
    }

    if (!trimmed) {
      flushList();
      return;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={index} className="my-3 border-surface-200" />);
      return;
    }

    flushList();
    elements.push(
      <p key={index} className="my-2 text-surface-800 leading-relaxed text-sm">{formatInline(trimmed, `p${index}-`)}</p>
    );
  });

  flushList();
  flushTable();
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
