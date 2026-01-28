/**
 * Session manager - tracks user sessions and conversation state
 */
import { v4 as uuidv4 } from 'uuid';

export interface UserSession {
  id: string;
  userId: string;
  graphId: string | null;
  conversationHistory: ConversationMessage[];
  createdAt: Date;
  lastActivity: Date;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export class SessionManager {
  private sessions: Map<string, UserSession> = new Map();
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Create a new session
   */
  createSession(userId: string, graphId?: string): UserSession {
    const session: UserSession = {
      id: uuidv4(),
      userId,
      graphId: graphId || null,
      conversationHistory: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // Check if session has expired
    const now = new Date();
    if (now.getTime() - session.lastActivity.getTime() > this.sessionTimeout) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = now;
    return session;
  }

  /**
   * Get or create session for a user
   */
  getOrCreateSession(userId: string, graphId?: string): UserSession {
    // Look for existing active session for this user
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        const now = new Date();
        if (now.getTime() - session.lastActivity.getTime() < this.sessionTimeout) {
          session.lastActivity = now;
          if (graphId) {
            session.graphId = graphId;
          }
          return session;
        }
      }
    }

    return this.createSession(userId, graphId);
  }

  /**
   * Add a message to session history
   */
  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.conversationHistory.push({
        role,
        content,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Set the active graph for a session
   */
  setActiveGraph(sessionId: string, graphId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.graphId = graphId;
    }
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string): ConversationMessage[] {
    const session = this.getSession(sessionId);
    return session?.conversationHistory || [];
  }

  /**
   * Clear conversation history for a session
   */
  clearHistory(sessionId: string): void {
    const session = this.getSession(sessionId);
    if (session) {
      session.conversationHistory = [];
    }
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  cleanup(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now.getTime() - session.lastActivity.getTime() > this.sessionTimeout) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
