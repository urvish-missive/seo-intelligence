// frontend/src/pages/ai/AIAssistantPage.jsx
// AI Assistant consultation page: streams answers from the local Ollama model,
// grounded in the workspace's synced GA4, Search Console and Clarity data.

import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { selectActiveWorkspace, selectUserPermissions, setCredentials } from '../../features/auth/authSlice.js';
import { API_BASE_URL } from '../../features/api/baseApi.js';
import { useGetWebsitesQuery } from '../../features/websites/websitesApi.js';
import {
  aiApi,
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
import ModelPicker from '../../features/ai/components/ModelPicker.jsx';
import {
  Sparkles,
  Send,
  Globe,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  MessageSquare,
  Square,
  RotateCcw,
  X,
} from 'lucide-react';

/** Parse one SSE block ("event: x\ndata: {...}") into { event, data }. */
function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const raw of block.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line || line.startsWith(':')) continue; // comments are keep-alive pings
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function AIAssistantPage() {
  const dispatch = useDispatch();
  const store = useStore();
  const activeWorkspace = useSelector(selectActiveWorkspace);
  const workspaceId = activeWorkspace?.id;
  const permissions = useSelector(selectUserPermissions) || [];

  const [activeConversationId, setActiveConversationId] = useState(null);
  const [isConvSidebarOpen, setIsConvSidebarOpen] = useState(false);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('');
  const [inputText, setInputText] = useState('');

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingEvidence, setStreamingEvidence] = useState(null);
  const [pendingUserText, setPendingUserText] = useState(null);
  const [streamStartedAt, setStreamStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [chatError, setChatError] = useState(null); // { message, text }
  const [auditResult, setAuditResult] = useState(null);
  const [auditError, setAuditError] = useState(null);

  const abortRef = useRef(null);
  const messagesEndRef = useRef(null);

  // 1. AI engine health
  const {
    data: healthRes,
    isLoading: isHealthLoading,
  } = useGetAiHealthQuery(workspaceId, { skip: !workspaceId, pollingInterval: 30000 });
  const health = healthRes?.data;

  // 2. Websites for the selector
  const { data: websitesRes } = useGetWebsitesQuery({ workspaceId }, { skip: !workspaceId });
  const websites = websitesRes?.data || [];

  // 3. Conversations (filtered by the selected website)
  const {
    data: convListRes,
    isLoading: isConvLoading,
    isFetching: isConvFetching,
  } = useGetConversationsQuery(
    { workspaceId, websiteId: selectedWebsiteId || undefined },
    { skip: !workspaceId }
  );
  const conversations = convListRes?.data?.conversations || [];

  // Open the most recent thread, but only once the list matches the current filter
  useEffect(() => {
    if (!activeConversationId && !isConvFetching && conversations.length > 0) {
      setActiveConversationId(conversations[0].id);
    }
  }, [conversations, activeConversationId, isConvFetching]);

  // 4. Active conversation with messages
  const { data: activeConvRes, isLoading: isMessagesLoading } = useGetConversationQuery(
    { workspaceId, conversationId: activeConversationId },
    { skip: !workspaceId || !activeConversationId }
  );
  const activeConversation = activeConvRes?.data;
  const messages = activeConversation?.messages || [];

  // Elapsed-time ticker while the local model is working
  useEffect(() => {
    if (!isStreaming) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isStreaming]);

  // Scroll to bottom on new message or stream chunk
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText, isStreaming, pendingUserText, chatError]);

  // Stop any running generation when leaving the page
  useEffect(() => () => abortRef.current?.abort(), []);

  const [createConversation, { isLoading: isCreatingConv }] = useCreateConversationMutation();
  const [deleteConversation] = useDeleteConversationMutation();
  const [sendMessage, { isLoading: isSendingMessage }] = useSendMessageMutation();
  const [generateAnalysis, { isLoading: isAnalyzing }] = useGenerateAnalysisMutation();

  const isBusy = isStreaming || isSendingMessage;

  const handleWebsiteChange = (websiteId) => {
    setSelectedWebsiteId(websiteId);
    // Threads belong to one website; start from that website's threads
    setActiveConversationId(null);
    setChatError(null);
    setAuditResult(null);
    setAuditError(null);
  };

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
        setChatError(null);
      }
    } catch (err) {
      setChatError({ message: err?.data?.message || 'Could not start a new conversation.' });
    }
  };

  const handleDeleteConversation = async (convId) => {
    if (!workspaceId) return;
    try {
      await deleteConversation({ workspaceId, conversationId: convId }).unwrap();
      if (activeConversationId === convId) setActiveConversationId(null);
    } catch (err) {
      setChatError({ message: err?.data?.message || 'Could not delete the conversation.' });
    }
  };

  /** Fetch a fresh access token using the refresh cookie (same flow as RTK Query). */
  const refreshAccessToken = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!r.ok) return null;
      const json = await r.json().catch(() => null);
      if (json?.data?.accessToken) {
        dispatch(setCredentials(json.data));
        return json.data.accessToken;
      }
    } catch {
      /* fall through */
    }
    return null;
  };

  /** Open the SSE stream with the user's token, refreshing it once on 401. */
  const openStream = async (conversationId, text, signal) => {
    const doFetch = (token) =>
      fetch(`${API_BASE_URL}/workspaces/${workspaceId}/ai/conversations/${conversationId}/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
        signal,
      });

    let response = await doFetch(store.getState().auth?.accessToken);
    if (response.status === 401) {
      const fresh = await refreshAccessToken();
      if (fresh) response = await doFetch(fresh);
    }
    return response;
  };

  /** Reload the thread from the server so saved messages replace the live stream. */
  const reloadConversation = async (conversationId) => {
    const sub = dispatch(
      aiApi.endpoints.getConversation.initiate({ workspaceId, conversationId }, { forceRefetch: true })
    );
    try {
      await sub;
    } finally {
      sub.unsubscribe();
    }
    dispatch(aiApi.util.invalidateTags(['AIConversations']));
  };

  const handleSendMessage = async (textToSend) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || !workspaceId || isBusy) return;

    setInputText('');
    setChatError(null);

    let conversationId = activeConversationId;
    if (!conversationId) {
      try {
        const newConv = await createConversation({
          workspaceId,
          websiteId: selectedWebsiteId || null,
          title: text.length > 40 ? `${text.slice(0, 37)}...` : text,
        }).unwrap();
        conversationId = newConv.data.id;
        setActiveConversationId(conversationId);
      } catch (err) {
        setChatError({ message: err?.data?.message || 'Could not start a conversation.', text });
        return;
      }
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setPendingUserText(text);
    setIsStreaming(true);
    setStreamingText('');
    setStreamingEvidence(null);
    setStreamStartedAt(Date.now());
    setNow(Date.now());

    let errorMessage = null;
    let useFallback = false;

    try {
      const response = await openStream(conversationId, text, controller.signal);

      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.message || `The assistant request failed (HTTP ${response.status}).`);
      }
      if (!response.body?.getReader) {
        useFallback = true; // very old browser: no streaming support
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = done ? '' : blocks.pop() || '';

          for (const block of blocks) {
            const evt = parseSseBlock(block);
            if (!evt) continue;
            if (evt.event === 'start') setStreamingEvidence(evt.data.evidenceMeta || null);
            else if (evt.event === 'token' && evt.data.token) setStreamingText((prev) => prev + evt.data.token);
            else if (evt.event === 'error') errorMessage = evt.data.error || 'The assistant could not generate an answer.';
          }
          if (done) break;
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        errorMessage = err.message || 'Could not reach the assistant.';
      }
    }

    if (useFallback) {
      try {
        await sendMessage({ workspaceId, conversationId, message: text }).unwrap();
      } catch (err) {
        errorMessage = err?.data?.message || 'The assistant could not generate an answer.';
      }
    }

    try {
      await reloadConversation(conversationId);
    } catch {
      /* the list will refresh on next load */
    }

    abortRef.current = null;
    setIsStreaming(false);
    setStreamingText('');
    setStreamingEvidence(null);
    setPendingUserText(null);
    setStreamStartedAt(null);

    if (errorMessage) setChatError({ message: errorMessage, text });
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleGenerateExecutiveReport = async () => {
    if (!workspaceId || !selectedWebsiteId) return;
    setAuditError(null);
    setAuditResult(null);
    try {
      const res = await generateAnalysis({
        workspaceId,
        websiteId: selectedWebsiteId,
        analysisType: 'EXECUTIVE_SUMMARY',
      }).unwrap();
      setAuditResult(res.data);
    } catch (err) {
      setAuditError(err?.data?.message || err?.error || 'Could not generate the executive audit.');
    }
  };

  const isModelReady = health?.available && health?.modelPresent;
  const waitedMs = streamStartedAt ? now - streamStartedAt : 0;
  const threadWebsite = activeConversation?.website?.domain;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white overflow-hidden relative">
      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={(id) => {
          if (isBusy) return;
          setActiveConversationId(id);
          setChatError(null);
        }}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        isLoading={isConvLoading || isCreatingConv}
        isOpen={isConvSidebarOpen}
        onClose={() => setIsConvSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="h-14 border-b border-surface-200 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 bg-white flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsConvSidebarOpen(!isConvSidebarOpen)}
              className="lg:hidden p-1.5 rounded-lg border border-surface-200 text-surface-600 hover:text-surface-900 hover:bg-surface-50 transition-colors flex items-center gap-1 text-xs flex-shrink-0"
              title="Toggle conversation list"
            >
              <MessageSquare className="w-4 h-4 text-brand-600" />
              <span className="hidden sm:inline">Threads</span>
            </button>

            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0 truncate">
              <h2 className="text-xs sm:text-sm font-bold text-surface-900 truncate">
                {activeConversation?.title || 'SEO Intelligence Assistant'}
              </h2>
              <div className="hidden sm:block text-3xs text-surface-400 truncate">
                {activeConversation
                  ? threadWebsite
                    ? `About ${threadWebsite} · last 28 days of synced data`
                    : 'About all websites · last 28 days of synced data'
                  : 'Answers use your synced GA4, Search Console and Clarity data'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
            <div className="flex items-center gap-1 sm:gap-1.5 bg-surface-50 border border-surface-200 rounded-md px-2 sm:px-2.5 py-1 text-xs max-w-[130px] sm:max-w-xs">
              <Globe className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
              <select
                value={selectedWebsiteId}
                onChange={(e) => handleWebsiteChange(e.target.value)}
                disabled={isBusy}
                className="bg-transparent text-surface-800 text-xs font-medium focus:outline-none cursor-pointer truncate w-full disabled:cursor-not-allowed"
                aria-label="Website"
              >
                <option value="">All websites</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.domain} {w.client?.name ? `(${w.client.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <ModelPicker
              workspaceId={workspaceId}
              health={health}
              canManage={permissions.includes('workspace.manage')}
              disabled={isBusy || isAnalyzing}
            />

            {selectedWebsiteId && (
              <button
                type="button"
                onClick={handleGenerateExecutiveReport}
                disabled={isAnalyzing || !isModelReady || isBusy}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-md text-xs font-medium border border-surface-300 transition-colors disabled:opacity-50"
                title="Generate an executive SEO report for this website"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-brand-600" />
                )}
                <span>{isAnalyzing ? 'Generating…' : 'Executive Audit'}</span>
              </button>
            )}
          </div>
        </header>

        <OllamaStatusBanner health={health} isLoading={isHealthLoading} />

        <div className="flex-1 overflow-y-auto divide-y divide-surface-100">
          {/* Executive audit output */}
          {(isAnalyzing || auditResult || auditError) && (
            <div className="bg-brand-50/40">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-700">Executive Audit</span>
                {!isAnalyzing && (
                  <button
                    type="button"
                    onClick={() => { setAuditResult(null); setAuditError(null); }}
                    className="p-1 text-surface-400 hover:text-surface-700"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isAnalyzing && (
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 text-xs text-surface-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                  Writing the executive audit. On a local model this can take a few minutes…
                </div>
              )}
              {auditError && (
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 text-xs text-rose-700">{auditError}</div>
              )}
              {auditResult && (
                <ChatMessage
                  message={{
                    role: 'ASSISTANT',
                    content: auditResult.outputSummary,
                    durationMs: auditResult.durationMs,
                    tokensUsed: auditResult.tokensUsed,
                    createdAt: auditResult.createdAt,
                  }}
                />
              )}
            </div>
          )}

          {isMessagesLoading ? (
            <div className="flex items-center justify-center h-64 text-surface-400 text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
              <span>Loading conversation…</span>
            </div>
          ) : messages.length === 0 && !isStreaming && !pendingUserText ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-surface-900 mb-1">Missive SEO Intelligence Assistant</h3>
              <p className="text-xs text-surface-500 max-w-md mx-auto mb-6">
                Ask about {selectedWebsiteId ? 'this website' : 'any of your websites'}. Answers use the last 28 days of
                synced GA4, Search Console and Clarity data plus open SEO findings, and run on your local AI model.
              </p>
              <SuggestedQuestions onSelect={(q) => handleSendMessage(q)} disabled={!isModelReady || isBusy} />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              {pendingUserText &&
                !(messages.at(-1)?.role === 'USER' && messages.at(-1)?.content === pendingUserText) && (
                  <ChatMessage message={{ role: 'USER', content: pendingUserText }} />
                )}

              {isStreaming && (
                <div>
                  <ChatMessage
                    message={{
                      role: 'ASSISTANT',
                      content:
                        streamingText ||
                        `Reading your data and thinking… ${formatElapsed(waitedMs)}${
                          waitedMs > 20000 ? '\n\nLocal models can take a minute or two before the first words appear.' : ''
                        }`,
                      toolsUsed: streamingEvidence,
                    }}
                    isStreaming
                  />
                  <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-3 -mt-1">
                    <button
                      type="button"
                      onClick={handleStop}
                      className="inline-flex items-center gap-1.5 text-xs text-surface-600 hover:text-rose-600 border border-surface-200 rounded-md px-2.5 py-1"
                    >
                      <Square className="w-3 h-3" /> Stop
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {chatError && (
            <div className="px-4 sm:px-6 py-3">
              <div className="max-w-4xl mx-auto flex items-start gap-2 p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold">The assistant couldn't answer</div>
                  <div className="mt-0.5">{chatError.message}</div>
                </div>
                {chatError.text && (
                  <button
                    type="button"
                    onClick={() => handleSendMessage(chatError.text)}
                    disabled={!isModelReady || isBusy}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-300 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3 h-3" /> Retry
                  </button>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

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
                    ? 'Ask about traffic, keyword opportunities, rage clicks or SEO fixes…'
                    : health?.available
                    ? `Model ${health?.activeModel || ''} is not installed in Ollama. See the banner above.`
                    : 'Ollama is offline. Start Ollama to use the assistant.'
                }
                disabled={!isModelReady || isBusy}
                className="w-full pl-4 pr-12 py-3 bg-surface-50 border border-surface-300 rounded-xl text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || !isModelReady || isBusy}
                className="absolute right-2 p-2 bg-brand-600 hover:bg-brand-700 disabled:bg-surface-300 text-white rounded-lg shadow-xs transition-colors disabled:cursor-not-allowed"
                title="Send message"
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-3xs text-center text-surface-400 mt-2">
              Runs on your local AI model · your data stays on this machine
            </p>
          </form>
        </footer>
      </main>
    </div>
  );
}
