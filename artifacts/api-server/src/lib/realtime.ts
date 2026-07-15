type RealtimeServer = {
  emit: (event: string, data: unknown) => void;
  to?: (room: string) => { emit: (event: string, data: unknown) => void };
};

let realtimeServer: RealtimeServer | null = null;

export function setRealtimeServer(server: RealtimeServer): void {
  realtimeServer = server;
}

export function emitRealtime(event: string, data: unknown): void {
  realtimeServer?.emit(event, data);
}

/** Yalnız belirli kullanıcı odasına yayın. */
export function emitRealtimeToUser(userId: number, event: string, data: unknown): void {
  if (!realtimeServer) return;
  if (typeof realtimeServer.to === "function") {
    realtimeServer.to(`user:${userId}`).emit(event, data);
  }
}

/** Belirli odaya yayın (ör. support:ticket:12). */
export function emitRealtimeToRoom(room: string, event: string, data: unknown): void {
  if (!realtimeServer) return;
  if (typeof realtimeServer.to === "function") {
    realtimeServer.to(room).emit(event, data);
  }
}