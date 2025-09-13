/**
 * Real-Time Streaming Indicator Component
 * 
 * Displays live streaming activity when remote messages are being processed
 * Shows real-time chunks and processing status
 */

import React, { useState, useEffect } from 'react';
import { StreamChunk } from '../services/realTimeStreamingService';

interface StreamingMessage {
  messageId: string;
  content: string;
  chunks: StreamChunk[];
  isComplete: boolean;
  startTime: number;
  endTime?: number;
}

interface RealTimeStreamingIndicatorProps {
  streamingMessages: StreamingMessage[];
  isActive: boolean;
  className?: string;
}

export const RealTimeStreamingIndicator: React.FC<RealTimeStreamingIndicatorProps> = ({
  streamingMessages,
  isActive,
  className = ''
}) => {
  const [expandedStreams, setExpandedStreams] = useState<Set<string>>(new Set());

  const toggleStreamExpansion = (messageId: string) => {
    setExpandedStreams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    const duration = (endTime || Date.now()) - startTime;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const getStreamContent = (chunks: StreamChunk[]) => {
    return chunks
      .filter(chunk => chunk.type === 'text')
      .map(chunk => chunk.content)
      .join('');
  };

  if (!isActive && streamingMessages.length === 0) {
    return null;
  }

  return (
    <div className={`real-time-streaming-indicator ${className}`}>
      {/* Header */}
      <div className="streaming-header">
        <div className="streaming-status">
          <div className={`status-dot ${isActive ? 'active' : 'inactive'}`} />
          <span className="status-text">
            {isActive ? 'Real-Time Streaming Active' : 'Streaming Inactive'}
          </span>
          {streamingMessages.length > 0 && (
            <span className="stream-count">
              {streamingMessages.length} active stream{streamingMessages.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Active Streams */}
      {streamingMessages.length > 0 && (
        <div className="active-streams">
          {streamingMessages.map((stream) => (
            <div key={stream.messageId} className="stream-item">
              <div 
                className="stream-header"
                onClick={() => toggleStreamExpansion(stream.messageId)}
              >
                <div className="stream-info">
                  <div className="stream-title">
                    <span className="message-preview">
                      {stream.content.substring(0, 50)}
                      {stream.content.length > 50 ? '...' : ''}
                    </span>
                    <span className={`stream-status ${stream.isComplete ? 'completed' : 'processing'}`}>
                      {stream.isComplete ? 'Completed' : 'Processing...'}
                    </span>
                  </div>
                  <div className="stream-meta">
                    <span className="duration">
                      {formatDuration(stream.startTime, stream.endTime)}
                    </span>
                    <span className="chunk-count">
                      {stream.chunks.length} chunks
                    </span>
                  </div>
                </div>
                <div className="expand-icon">
                  {expandedStreams.has(stream.messageId) ? '▼' : '▶'}
                </div>
              </div>

              {expandedStreams.has(stream.messageId) && (
                <div className="stream-details">
                  {/* Live Response */}
                  <div className="live-response">
                    <div className="response-header">Live Response:</div>
                    <div className="response-content">
                      {getStreamContent(stream.chunks) || 'Waiting for response...'}
                      {!stream.isComplete && (
                        <span className="typing-indicator">▊</span>
                      )}
                    </div>
                  </div>

                  {/* Chunk Timeline */}
                  <div className="chunk-timeline">
                    <div className="timeline-header">Chunk Timeline:</div>
                    <div className="timeline-items">
                      {stream.chunks.map((chunk, index) => (
                        <div key={chunk.id} className="timeline-item">
                          <div className="chunk-info">
                            <span className="chunk-index">#{index + 1}</span>
                            <span className="chunk-type">{chunk.type}</span>
                            <span className="chunk-time">
                              +{((chunk.timestamp - stream.startTime) / 1000).toFixed(2)}s
                            </span>
                          </div>
                          <div className="chunk-content">
                            {chunk.content.length > 100 
                              ? `${chunk.content.substring(0, 100)}...`
                              : chunk.content
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Bar */}
              {!stream.isComplete && (
                <div className="stream-progress">
                  <div className="progress-bar">
                    <div className="progress-fill animate-pulse" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .real-time-streaming-indicator {
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 12px;
          margin: 8px 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12px;
          color: white;
        }

        .streaming-header {
          margin-bottom: 12px;
        }

        .streaming-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #666;
        }

        .status-dot.active {
          background: #00ff88;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .status-text {
          font-weight: 500;
        }

        .stream-count {
          background: rgba(0, 255, 136, 0.2);
          color: #00ff88;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
        }

        .active-streams {
          space-y: 8px;
        }

        .stream-item {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .stream-header {
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background-color 0.2s;
        }

        .stream-header:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .stream-info {
          flex: 1;
        }

        .stream-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .message-preview {
          font-weight: 500;
        }

        .stream-status {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 500;
        }

        .stream-status.processing {
          background: rgba(255, 165, 0, 0.2);
          color: #ffa500;
        }

        .stream-status.completed {
          background: rgba(0, 255, 136, 0.2);
          color: #00ff88;
        }

        .stream-meta {
          display: flex;
          gap: 12px;
          font-size: 10px;
          color: #ccc;
        }

        .expand-icon {
          color: #888;
          font-size: 10px;
        }

        .stream-details {
          padding: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.3);
        }

        .live-response {
          margin-bottom: 16px;
        }

        .response-header {
          font-weight: 500;
          margin-bottom: 6px;
          color: #00ff88;
        }

        .response-content {
          background: rgba(0, 0, 0, 0.5);
          padding: 8px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          line-height: 1.4;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .typing-indicator {
          color: #00ff88;
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        .chunk-timeline {
          margin-top: 12px;
        }

        .timeline-header {
          font-weight: 500;
          margin-bottom: 6px;
          color: #ffa500;
        }

        .timeline-items {
          max-height: 200px;
          overflow-y: auto;
        }

        .timeline-item {
          margin-bottom: 8px;
          padding: 6px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
        }

        .chunk-info {
          display: flex;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 10px;
        }

        .chunk-index {
          color: #00ff88;
          font-weight: 500;
        }

        .chunk-type {
          background: rgba(255, 165, 0, 0.2);
          color: #ffa500;
          padding: 1px 4px;
          border-radius: 2px;
        }

        .chunk-time {
          color: #888;
        }

        .chunk-content {
          font-family: 'Courier New', monospace;
          font-size: 10px;
          line-height: 1.3;
          color: #ddd;
        }

        .stream-progress {
          padding: 0 12px 8px;
        }

        .progress-bar {
          height: 2px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 1px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff88, #0088ff);
          width: 100%;
          animation: progress-slide 2s infinite;
        }

        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default RealTimeStreamingIndicator;