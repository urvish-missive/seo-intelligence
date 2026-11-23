// frontend/src/features/ai/components/ConversationSidebar.jsx
import React, { useState } from 'react';
import { Plus, MessageSquare, Trash2, Search, Sparkles, X } from 'lucide-react';

export default function ConversationSidebar({
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isLoading,
  isOpen = false,
  onClose,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = conversations.filter(c =>
    (c.title || 'New SEO Consultation').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-surface-950/40 backdrop-blur-xs z-30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40 lg:z-auto
          w-72 bg-surface-50 border-r border-surface-200
          flex flex-col h-full flex-shrink-0
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0 shadow-dropdown lg:shadow-none' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header with New Chat Button & Close on Mobile */}
        <div className="p-3.5 border-b border-surface-200 bg-white flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onNewConversation?.();
              onClose?.();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Consultation</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-2 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg transition-colors"
            aria-label="Close conversation drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Threads */}
        <div className="p-2.5 border-b border-surface-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-surface-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-surface-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 text-surface-800 placeholder-surface-400"
            />
          </div>
        </div>

        {/* Conversation Thread List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading && conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-surface-400">Loading threads...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-surface-400">
              {searchTerm ? 'No conversations found' : 'No prior consultations'}
            </div>
          ) : (
            filtered.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onClose?.();
                  }}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-all ${
                    isActive
                      ? 'bg-brand-50 border border-brand-200 text-brand-900 font-medium'
                      : 'text-surface-700 hover:bg-surface-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-brand-600' : 'text-surface-400'}`} />
                    <div className="truncate">
                      <p className="truncate font-medium">{conv.title || 'New SEO Consultation'}</p>
                      {conv.website?.domain && (
                        <p className="text-3xs text-surface-400 truncate">{conv.website.domain}</p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this conversation thread?')) {
                        onDeleteConversation(conv.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-surface-400 hover:text-red-600 rounded transition-opacity"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t border-surface-200 bg-white/50 text-3xs text-surface-400 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-brand-500" />
            <span>Local Ollama</span>
          </span>
          <span>Strict Privacy</span>
        </div>
      </aside>
    </>
  );
}
