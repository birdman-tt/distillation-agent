type RealtimeSocket = {
  readyState: number;
  send(data: string): void;
};

type RealtimeMessage = {
  id: string;
  role: "SYSTEM" | "USER" | "ASSISTANT";
  content: string;
  basis: Array<{ sourceId: string; snippet: string }> | null;
  basisSummary: { mode: "SUPPORTED" | "INFERRED" | "UNSUPPORTED"; summary: string } | null;
  inferenceLevel: "grounded" | "inferred" | "insufficient_evidence" | null;
  conflictDetected: boolean | null;
  refusalReason:
    | "none"
    | "high_risk"
    | "policy_blocked"
    | "insufficient_evidence"
    | "conflicting_evidence"
    | "out_of_scope"
    | null;
  createdAt: string;
};

export type RealtimeEvent =
  | { type: "chat.subscription.ready"; chatId: string }
  | { type: "chat.message.created"; chatId: string; message: RealtimeMessage }
  | { type: "chat.turn.completed"; chatId: string; turnTraceId: string }
  | { type: "chat.turn.failed"; chatId: string; turnTraceId: string; message: string };

const OPEN = 1;

class ChatRealtimeHub {
  private readonly socketsByChatId = new Map<string, Set<RealtimeSocket>>();

  subscribe(chatId: string, socket: RealtimeSocket) {
    const sockets = this.socketsByChatId.get(chatId) ?? new Set<RealtimeSocket>();
    sockets.add(socket);
    this.socketsByChatId.set(chatId, sockets);
  }

  unsubscribe(chatId: string, socket: RealtimeSocket) {
    const sockets = this.socketsByChatId.get(chatId);
    if (!sockets) {
      return;
    }
    sockets.delete(socket);
    if (sockets.size === 0) {
      this.socketsByChatId.delete(chatId);
    }
  }

  publish(event: RealtimeEvent) {
    const sockets = this.socketsByChatId.get(event.chatId);
    if (!sockets) {
      return 0;
    }

    let delivered = 0;
    const payload = JSON.stringify(event);
    for (const socket of sockets) {
      if (socket.readyState !== OPEN) {
        sockets.delete(socket);
        continue;
      }
      socket.send(payload);
      delivered += 1;
    }
    return delivered;
  }
}

export const chatRealtimeHub = new ChatRealtimeHub();

