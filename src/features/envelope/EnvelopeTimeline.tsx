/**
 * EnvelopeTimeline Component
 *
 * Displays chronological timeline of envelope activity
 * (retrievals, feedback, summaries)
 */

import { useState, useEffect } from 'preact/hooks';
import { glyphCaseManager } from '../../db/glyphcase.manager';
import './EnvelopeTimeline.css';

interface TimelineEvent {
  eventType: 'retrieval' | 'feedback' | 'summary';
  id: string;
  timestamp: string;
  description: string;
  value: number | null;
}

export interface EnvelopeTimelineProps {
  limit?: number;
}

export function EnvelopeTimeline({ limit = 50 }: EnvelopeTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTimeline();
  }, [limit]);

  const loadTimeline = async () => {
    if (!glyphCaseManager.isDynamic()) {
      setEvents([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const envelope = glyphCaseManager.getEnvelope();
      if (!envelope.isOpen()) {
        setEvents([]);
        return;
      }

      const activity = envelope.getRecentActivity(limit);
      setEvents(activity);
    } catch (err) {
      setError(String(err));
      console.error('[EnvelopeTimeline] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'retrieval':
        return '🔍';
      case 'feedback':
        return '💬';
      case 'summary':
        return '📝';
      default:
        return '•';
    }
  };

  const getEventClass = (type: string) => {
    switch (type) {
      case 'retrieval':
        return 'timeline-event-retrieval';
      case 'feedback':
        return 'timeline-event-feedback';
      case 'summary':
        return 'timeline-event-summary';
      default:
        return '';
    }
  };

  const getFeedbackLabel = (value: number | null) => {
    if (value === null) return '';
    if (value === 1) return '👍 Helpful';
    if (value === -1) return '👎 Not helpful';
    return '• Neutral';
  };

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch {
      return ts;
    }
  };

  if (!glyphCaseManager.isDynamic()) {
    return (
      <div className="envelope-timeline">
        <div className="timeline-empty">
          <p>Timeline is only available in Dynamic mode.</p>
          <p className="timeline-hint">Enable Dynamic mode to start tracking activity.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="envelope-timeline">
        <div className="timeline-loading">
          <div className="spinner"></div>
          <p>Loading timeline...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="envelope-timeline">
        <div className="timeline-error">
          <p>⚠️ Failed to load timeline</p>
          <p className="error-message">{error}</p>
          <button className="btn-secondary btn-sm" onClick={loadTimeline}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="envelope-timeline">
        <div className="timeline-empty">
          <p>No activity yet.</p>
          <p className="timeline-hint">Search, give feedback, or generate summaries to populate the timeline.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="envelope-timeline">
      <div className="timeline-header">
        <h3>📜 Activity Timeline</h3>
        <span className="timeline-count">{events.length} events</span>
      </div>

      <div className="timeline-events">
        {events.map((event, index) => (
          <div
            key={`${event.id}-${index}`}
            className={`timeline-event ${getEventClass(event.eventType)}`}
          >
            <div className="timeline-event-icon">
              {getEventIcon(event.eventType)}
            </div>

            <div className="timeline-event-content">
              <div className="timeline-event-header">
                <span className="timeline-event-type">
                  {event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1)}
                </span>
                <span className="timeline-event-time">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>

              <div className="timeline-event-description">
                {event.description}
              </div>

              {event.eventType === 'feedback' && event.value !== null && (
                <div className="timeline-event-meta">
                  {getFeedbackLabel(event.value)}
                </div>
              )}

              {event.eventType === 'summary' && event.value !== null && (
                <div className="timeline-event-meta">
                  Relevance: {(event.value * 100).toFixed(0)}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="timeline-footer">
        <button
          className="btn-secondary btn-sm"
          onClick={loadTimeline}
        >
          Refresh Timeline
        </button>
      </div>
    </div>
  );
}
