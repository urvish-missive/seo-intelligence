// frontend/src/pages/ai/AIAssistantPage.jsx
// Complete Phase 8 AI Assistant consultation page.

import React, { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import { API_BASE_URL } from '../../features/api/baseApi.js';
import { useGetWebsitesQuery } from '../../features/websites/websitesApi.js';
import {
  useGetAiHealthQuery,
  useGetConversationsQuery,
  useGetConversationQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useSendMessageMutation,
  useGenerateAnalysisMutation,
} from '../../features/ai/aiApi.js';
import ConversationSidebar from '../../features/ai/components/ConversationSidebar.jsx';
import ChatMessage from '../../features/ai/components/ChatMessage.jsx';
import SuggestedQuestions from '../../features/ai/components/SuggestedQuestions.jsx';
import OllamaStatusBanner from '../../features/ai/components/OllamaStatusBanner.jsx';
import {
  Sparkles,
  Send,
  Globe,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';

export default function AIAssistantPage() {
  const activeWorkspace = useSelector(selectActiveWorkspace);
  const workspaceId = activeWorkspace?.id;

  const [activeConversationId, setActiveConversationId] = useState(null);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('');
  const [inputText, setInputText] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingEvidence, setStreamingEvidence] = useState(null);

  const messagesEndRef = useRef(null);

  // 1. Fetch AI Engine Health
  const {
    data: healthRes,
    isLoading: isHealthLoading,
    refetch: refetchHealth,
  } = useGetAiHealthQuery(workspaceId, { skip: !workspaceId, pollingInterval: 30000 });
  const health = healthRes?.data;

  // 2. Fetch Websites for dropdown
  const { data: websitesRes } = useGetWebsitesQuery(
    { workspaceId },
    { skip: !workspaceId }
  );
  const websites = websitesRes?.data || [];

  // 3. Fetch Conversations in workspace
  const {
    data: convListRes,
    isLoading: isConvLoading,
  } = useGetConversationsQuery(
    { workspaceId, websiteId: selectedWebsiteId || undefined },
    { skip: !workspaceId }
  );
  const conversations = convListRes?.data?.conversations || [];

  // Automatically select first conversation if none selected
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId]);

  // 4. Fetch Active Conversation detail with messages
  const {
    data: activeConvRes,
    isLoading: isMessagesLoading,
  } = useGetConversationQuery(
    { workspaceId, conversationId: activeConversationId },
    { skip: !workspaceId || !activeConversationId }
  );
  const activeConversation = activeConvRes?.data;
  const messages = activeConversation?.messages || [];

  // Update selected website if active conversation has one
  useEffect(() => {
    if (activeConversation?.websiteId && !selectedWebsiteId) {
      setSelectedWebsiteId(activeConversation.websiteId);
    }
  }, [activeConversation, selectedWebsiteId]);

  // Scroll to bottom on new message or stream chunk
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, isStreaming]);

  // Mutations
  const [createConversation, { isLoading: isCreatingConv }] = useCreateConversationMutation();
  const [deleteConversation] = useDeleteConversationMutation();
  const [sendMessage, { isLoading: isSendingMessage }] = useSendMessageMutation();
  const [generateAnalysis, { isLoading: isAnalyzing }] = useGenerateAnalysisMutation();

  // Create new conversation thread
  const handleNewConversation = async () => {
    if (!workspaceId) return;
    try {
      const res = await createConversation({
        workspaceId,
        websiteId: selectedWebsiteId || null,
        title: 'New SEO Consultation',
      }).unwrap();
      if (res.data?.id) {
        setActiveConversationId(res.data.id);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (convId) => {
    if (!workspaceId) return;
    try {
      await deleteConversation({ workspaceId, conversationId: convId }).unwrap();
      if (activeConversationId === convId) {
        setActiveConversationId(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Submit message (Supports SSE streaming with fallback to standard mutation)
  const handleSendMessage = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim() || !workspaceId) return;

    setInputText('');

    // Ensure we have an active conversation
    let currentConvId = activeConversationId;
    if (!currentConvId) {
      try {
        const newConv = await createConversation({
          workspaceId,
          websiteId: selectedWebsiteId || null,
          title: text.slice(0, 35) + '...',
        }).unwrap();
        currentConvId = newConv.data.id;
        setActiveConversationId(currentConvId);
      } catch (err) {
        console.error('Failed to initialize conversation:', err);
        return;
      }
    }

    // Attempt streaming via fetch
    try {
      setIsStreaming(true);
      setStreamingText('');
      setStreamingEvidence(null);

      const response = await fetch(
        `${API_BASE_URL}/workspaces/${workspaceId}/ai/conversations/${currentConvId}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            websiteId: selectedWebsiteId || undefined,
          }),
        }
      );

      if (!response.ok || !response.body) {
        throw new Error('Streaming failed or not supported');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const block of lines) {
            const trimmed = block.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('event: start')) {
              const dataLine = trimmed.split('\n').find(l => l.startsWith('data: '));
              if (dataLine) {
                try {
                  const parsed = JSON.parse(dataLine.replace('data: ', ''));
                  setStreamingEvidence(parsed.evidenceMeta);
                } catch {}
              }
            } else if (trimmed.startsWith('event: token')) {
              const dataLine = trimmed.split('\n').find(l => l.startsWith('data: '));
              if (dataLine) {
                try {
                  const parsed = JSON.parse(dataLine.replace('data: ', ''));
                  if (parsed.token) {
                    setStreamingText(prev => prev + parsed.token);
                  }
                } catch {}
              }
            } else if (trimmed.startsWith('event: done')) {
              // Finalized
            } else if (trimmed.startsWith('event: error')) {
              const dataLine = trimmed.split('\n').find(l => l.startsWith('data: '));
              if (dataLine) {
                const parsed = JSON.parse(dataLine.replace('data: ', ''));
                throw new Error(parsed.error || 'AI generation error');
              }
            }
          }
        }
      }

      setIsStreaming(false);
      setStreamingText('');
      setStreamingEvidence(null);
    } catch (streamErr) {
      console.warn('Streaming encountered an issue, falling back to standard API:', streamErr.message);
      setIsStreaming(false);
      setStreamingText('');
      setStreamingEvidence(null);

      // Fallback to standard RTK Query mutation
      try {
        await sendMessage({
          workspaceId,
          conversationId: currentConvId,
          message: text,
          websiteId: selectedWebsiteId || undefined,
        }).unwrap();
      } catch (mutationErr) {
        console.error('Send message failed:', mutationErr);
      }
    }
  };

  // Trigger one-click executive analysis
  const handleGenerateExecutiveReport = async () => {
    if (!workspaceId || !selectedWebsiteId) {
      alert('Please select a website from the dropdown to run an executive analysis.');
      return;
    }
    try {
      await generateAnalysis({
        workspaceId,
        websiteId: selectedWebsiteId,
        analysisType: 'EXECUTIVE_SUMMARY',
      }).unwrap();
      alert('Executive SEO Report generated and saved to database successfully!');
    } catch (err) {
      alert('Failed to generate analysis: ' + (err.data?.message || err.message));
    }
  };

  const isModelReady = health?.available && health?.modelPresent;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white overflow-hidden">
      {/* 1. Left Sidebar: Conversations */}
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => setActiveConversationId(id)}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isLoading={isConvLoading || isCreatingConv}
      />

      {/* 2. Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Header */}
        <header className="h-14 border-b border-surface-200 px-4 sm:px-6 flex items-center justify-between gap-3 bg-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-surface-900 truncate">
                {activeConversation?.title || 'SEO Intelligence Assistant'}
              </h2>
              <div className="flex items-center gap-2 text-3xs text-surface-400">
                <span>Phase 8</span>
                <span>•</span>
                <span>Deterministic Evidence Layer</span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2.5">
            {/* Website Selector */}
            <div className="flex items-center gap-1.5 bg-surface-50 border border-surface-200 rounded-md px-2.5 py-1 text-xs">
              <Globe className="w-3.5 h-3.5 text-surface-400" />
              <select
                value={selectedWebsiteId}
                onChange={(e) => setSelectedWebsiteId(e.target.value)}
                className="bg-transparent text-surface-800 text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="">All Websites / General</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.domain} {w.client?.name ? `(${w.client.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Model Health Indicator Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-3xs font-medium border ${
                isModelReady
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : health?.available
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
              title={health?.message || 'Checking Ollama...'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isModelReady ? 'bg-emerald-500' : health?.available ? 'bg-amber-500' : 'bg-rose-500'
                }`}
              />
              <span className="font-mono">{health?.activeModel || 'qwen2.5:7b'}</span>
            </div>

            {/* Quick Executive Analysis Button */}
            {selectedWebsiteId && (
              <button
                type="button"
                onClick={handleGenerateExecutiveReport}
                disabled={isAnalyzing || !isModelReady}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-md text-xs font-medium border border-surface-300 transition-colors disabled:opacity-50"
                title="Generate comprehensive executive SEO report"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-brand-600" />
                )}
                <span>Executive Audit</span>
              </button>
            )}
          </div>
        </header>

        {/* Ollama Offline / Missing Model Alert Banner */}
        <OllamaStatusBanner health={health} isLoading={isHealthLoading} />

        {/* Message Thread Container */}
        <div className="flex-1 overflow-y-auto divide-y divide-surface-100">
          {isMessagesLoading ? (
            <div className="flex items-center justify-center h-64 text-surface-400 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
              <span>Retrieving consultation history...</span>
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-surface-900 mb-1">
                Missive SEO Intelligence Assistant
              </h3>
              <p className="text-xs text-surface-500 max-w-md mx-auto mb-6">
                Consult with your local AI reasoning model. Answers are grounded in your stored
                GA4 traffic, Search Console queries, Microsoft Clarity UX friction, and Phase 7 findings.
              </p>

              {/* Suggested Questions */}
              <SuggestedQuestions
                onSelect={(q) => handleSendMessage(q)}
                disabled={!isModelReady || isSendingMessage || isStreaming}
              />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {/* Streaming Assistant Response */}
              {isStreaming && (
                <ChatMessage
                  message={{
                    role: 'ASSISTANT',
                    content: streamingText || 'Analysing local MySQL metrics and synthesising findings...',
                    toolsUsed: streamingEvidence,
                  }}
                  isStreaming={true}
                />
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Bottom Input Area */}
        <footer className="p-4 border-t border-surface-200 bg-white flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="max-w-4xl mx-auto"
          >
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  isModelReady
                    ? 'Ask about traffic drops, striking distance keywords, rage clicks, or SEO fixes...'
                    : 'Ollama is offline. Start Ollama locally to enable the assistant...'
                }
                disabled={!isModelReady || isSendingMessage || isStreaming}
                className="w-full pl-4 pr-12 py-3 bg-surface-50 border border-surface-300 rounded-xl text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || !isModelReady || isSendingMessage || isStreaming}
                className="absolute right-2 p-2 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-300 text-white rounded-lg shadow-xs transition-colors disabled:cursor-not-allowed"
                title="Send message"
              >
                {isSendingMessage || isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-3xs text-center text-surface-400 mt-2">
              Local AI Engine • Strictly private • Grounded in actual MySQL SEO data
            </p>
          </form>
        </footer>
      </main>
    </div>
  );
}
