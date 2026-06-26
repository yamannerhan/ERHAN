type RealtimeServer = {
  emit: (event: string, data: unknown) => void;
};

let realtimeServer: RealtimeServer | null = null;

export function setRealtimeServer(server: RealtimeServer): void {
  realtimeServer = server;
}

export function emitRealtime(event: string, data: unknown): void {
  realtimeServer?.emit(event, data);
}