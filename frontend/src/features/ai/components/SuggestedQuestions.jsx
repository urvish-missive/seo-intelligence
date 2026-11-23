// frontend/src/features/ai/components/SuggestedQuestions.jsx
import React from 'react';
import { TrendingDown, Key, MousePointerClick, ShieldAlert, Sparkles } from 'lucide-react';

const SUGGESTIONS = [
  {
    icon: TrendingDown,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
    label: 'Organic Traffic Shifts',
    query: 'Why did organic traffic drop over the last 30 days compared to the previous period?',
  },
  {
    icon: Key,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    label: 'Striking Distance Queries',
    query: 'Which striking distance keywords (ranking 4-20) should we target for immediate ranking gains?',
  },
  {
    icon: MousePointerClick,
    color: 'text-sky-600 bg-sky-50 border-sky-200',
    label: 'Clarity UX Bottlenecks',
    query: 'What user behaviour friction, rage clicks, or dead clicks does Microsoft Clarity report?',
  },
  {
    icon: ShieldAlert,
    color: 'text-violet-600 bg-violet-50 border-violet-200',
    label: 'Open SEO Issues',
    query: 'Summarise the open deterministic SEO findings and give me a prioritised action plan.',
  },
];

export default function SuggestedQuestions({ onSelect, disabled }) {
  return (
    <div className="w-full max-w-3xl mx-auto my-6">
      <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-surface-500 uppercase tracking-wider">
        <Sparkles className="w-3.5 h-3.5 text-brand-500" />
        <span>Suggested Consultations</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SUGGESTIONS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(item.query)}
              className="flex items-start gap-3 p-3.5 text-left bg-white hover:bg-surface-50 border border-surface-200 rounded-lg shadow-2xs hover:shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className={`p-2 rounded-md ${item.color} flex-shrink-0 mt-0.5`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-surface-900 group-hover:text-brand-600 transition-colors">
                  {item.label}
                </p>
                <p className="text-xs text-surface-500 line-clamp-2 mt-0.5">
                  {item.query}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
