/**
 * Query Panel component - input for asking questions about the graph
 */
import React, { useState, useCallback } from 'react';

interface QueryPanelProps {
  selectedNodes: string[];
  onAsk: (question: string) => Promise<void>;
  response: string | null;
  isLoading: boolean;
  graphId: string | null;
}

// Pre-fill question templates
const questionTemplates = [
  { label: 'What breaks if this is down?', requiresNode: true, template: 'What breaks if {node} is down?' },
  { label: 'Why are these coupled?', requiresMultiple: true, template: 'Why are these services coupled?' },
  { label: 'Show overview', requiresNode: false, template: 'Show me an overview of this graph' },
  { label: 'Find critical dependencies', requiresNode: false, template: 'What are the critical dependencies in this system?' },
];

export function QueryPanel({
  selectedNodes,
  onAsk,
  response,
  isLoading,
  graphId,
}: QueryPanelProps) {
  const [question, setQuestion] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    await onAsk(question);
  }, [question, onAsk, isLoading]);

  const handleTemplateClick = useCallback((template: typeof questionTemplates[0]) => {
    if (template.requiresNode && selectedNodes.length === 0) {
      setQuestion('Please select a service first to analyze');
      return;
    }
    if (template.requiresMultiple && selectedNodes.length < 2) {
      setQuestion('Please select at least two services to compare');
      return;
    }
    
    let q = template.template;
    if (template.requiresNode) {
      q = q.replace('{node}', selectedNodes[0]);
    }
    setQuestion(q);
  }, [selectedNodes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (question.trim() && !isLoading) {
        onAsk(question);
      }
    }
  }, [question, onAsk, isLoading]);

  return (
    <div className="query-panel">
      {/* Quick action buttons */}
      <div className="query-buttons">
        {questionTemplates.map((template, idx) => (
          <button
            key={idx}
            className="btn btn-secondary btn-small"
            onClick={() => handleTemplateClick(template)}
            disabled={!graphId || isLoading}
            title={
              template.requiresNode && selectedNodes.length === 0
                ? 'Select a node first'
                : template.requiresMultiple && selectedNodes.length < 2
                ? 'Select multiple nodes'
                : undefined
            }
          >
            {template.label}
          </button>
        ))}
      </div>

      {/* Selection indicator */}
      {selectedNodes.length > 0 && (
        <div className="selection-info">
          <strong>Selected:</strong> {selectedNodes.join(', ')}
          {selectedNodes.length === 1 && ' — Click more nodes with Ctrl/Cmd to multi-select'}
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="query-input-container">
        <input
          type="text"
          className="query-input"
          placeholder={graphId ? 'Ask about the architecture...' : 'Select a graph first'}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!graphId || isLoading}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!graphId || isLoading || !question.trim()}
        >
          {isLoading ? 'Analyzing...' : 'Ask'}
        </button>
      </form>

      {/* Response area */}
      {response && (
        <div className="response-panel">
          <ResponseContent content={response} />
        </div>
      )}
    </div>
  );
}

/**
 * Render response content with basic markdown support
 */
function ResponseContent({ content }: { content: string }) {
  // Simple markdown-like rendering
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={elements.length}>
          {listItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('## ')) {
      flushList();
      elements.push(<h2 key={i}>{line.slice(3)}</h2>);
      continue;
    }
    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={i}>{line.slice(4)}</h3>);
      continue;
    }

    // List items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      inList = true;
      listItems.push(formatInlineMarkdown(line.slice(2)));
      continue;
    }

    // Regular text
    flushList();
    if (line.trim()) {
      elements.push(<p key={i}>{formatInlineMarkdown(line)}</p>);
    }
  }

  flushList();

  return <>{elements}</>;
}

/**
 * Format inline markdown (bold, code)
 */
function formatInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(remaining.slice(0, boldMatch.index));
      }
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }

    // Code
    const codeMatch = remaining.match(/`([^`]+)`/);
    if (codeMatch && codeMatch.index !== undefined) {
      if (codeMatch.index > 0) {
        parts.push(remaining.slice(0, codeMatch.index));
      }
      parts.push(<code key={key++}>{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch.index + codeMatch[0].length);
      continue;
    }

    // No more patterns
    parts.push(remaining);
    break;
  }

  return <>{parts}</>;
}
