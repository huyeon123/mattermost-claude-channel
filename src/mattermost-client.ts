import { appendFileSync } from 'node:fs';

export interface MattermostEvent {
  event: string;
  data: {
    post?: string | MattermostPost;  // string before parsing, MattermostPost after
    channel_id?: string;
    channel_type?: string;
    sender_name?: string;
    [key: string]: unknown;
  };
  broadcast: {
    channel_id?: string;
    user_id?: string;
    [key: string]: unknown;
  };
  seq: number;
}

export interface MattermostPost {
  id: string;
  channel_id: string;
  user_id: string;
  message: string;
  create_at: number;
  type: string;
  props: Record<string, unknown>;
}

export interface MattermostUser {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  nickname: string;
}

type LogLevel = "debug" | "info" | "warn" | "error" | "none";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

function createLogger(level: LogLevel = "info", logFilePath?: string) {
  const threshold = LOG_LEVELS[level];
  const write = (prefix: string, ...args: unknown[]) => {
    const line = `[${new Date().toISOString()}] [mattermost] ${prefix} ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`;
    process.stderr.write(line);
    if (logFilePath) appendFileSync(logFilePath, line);
  };
  return {
    debug: (...args: unknown[]) => { if (threshold <= LOG_LEVELS.debug) write('DEBUG', ...args); },
    info: (...args: unknown[]) => { if (threshold <= LOG_LEVELS.info) write('INFO', ...args); },
    warn: (...args: unknown[]) => { if (threshold <= LOG_LEVELS.warn) write('WARN', ...args); },
    error: (...args: unknown[]) => { if (threshold <= LOG_LEVELS.error) write('ERROR', ...args); },
  };
}

export class MattermostClient {
  private url: string;
  private token: string;
  private botUserId: string | null = null;
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(event: MattermostEvent) => void> = [];
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private seq = 1;
  private shouldReconnect = false;
  private log: ReturnType<typeof createLogger>;

  constructor(url: string, token: string, logLevel: LogLevel = "info", logFile?: string) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.log = createLogger(logLevel, logFile);
  }

  connect(): Promise<void> {
    this.shouldReconnect = true;
    return this._connect();
  }

  private _connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.url.replace(/^http/, "ws") + "/api/v4/websocket";
      this.log.info(`Connecting to ${wsUrl}`);

      let resolved = false;

      try {
        this.ws = new WebSocket(wsUrl);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.addEventListener("open", () => {
        this.log.info("WebSocket connected, sending auth challenge");
        this.reconnectDelay = 1000;

        const authMsg = {
          seq: this.seq++,
          action: "authentication_challenge",
          data: { token: this.token },
        };
        this.ws!.send(JSON.stringify(authMsg));

        if (!resolved) {
          resolved = true;
          resolve();
        }
      });

      this.ws.addEventListener("message", (ev: MessageEvent) => {
        let parsed: MattermostEvent;
        try {
          parsed = JSON.parse(ev.data as string) as MattermostEvent;
        } catch {
          this.log.warn("Failed to parse WebSocket message:", ev.data);
          return;
        }

        this.log.debug("Event received:", parsed.event, "seq:", parsed.seq);

        if (parsed.event === "posted" && typeof parsed.data.post === "string") {
          try {
            parsed.data.post = JSON.parse(parsed.data.post) as MattermostPost;
          } catch {
            this.log.warn("Failed to parse post JSON in event data");
          }
        }

        for (const handler of this.messageHandlers) {
          try {
            handler(parsed);
          } catch (err) {
            this.log.error("Message handler threw:", err);
          }
        }
      });

      this.ws.addEventListener("close", (ev: CloseEvent) => {
        this.log.info(
          `WebSocket closed (code=${ev.code}, reason=${ev.reason || "none"})`
        );
        this.ws = null;

        if (!resolved) {
          resolved = true;
          reject(new Error(`WebSocket closed before auth: code=${ev.code}`));
          return;
        }

        if (this.shouldReconnect) {
          this.log.info(`Reconnecting in ${this.reconnectDelay}ms...`);
          setTimeout(() => {
            if (this.shouldReconnect) {
              this._connect().catch((err) =>
                this.log.error("Reconnect failed:", err)
              );
            }
          }, this.reconnectDelay);

          this.reconnectDelay = Math.min(
            this.reconnectDelay * 2,
            this.maxReconnectDelay
          );
        }
      });

      this.ws.addEventListener("error", (ev: Event) => {
        this.log.error("WebSocket error:", ev);
        if (!resolved) {
          resolved = true;
          reject(new Error("WebSocket error during connect"));
        }
      });
    });
  }

  onMessage(callback: (event: MattermostEvent) => void): void {
    this.messageHandlers.push(callback);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.log.info("Disconnecting WebSocket");
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  async getMe(): Promise<MattermostUser> {
    return this.api<MattermostUser>("GET", "/users/me");
  }

  async createPost(channelId: string, message: string): Promise<MattermostPost> {
    return this.api<MattermostPost>("POST", "/posts", {
      channel_id: channelId,
      message,
    });
  }

  async createDirectChannel(userId: string): Promise<{ id: string }> {
    if (!this.botUserId) {
      const me = await this.getMe();
      this.botUserId = me.id;
    }
    return this.api<{ id: string }>("POST", "/channels/direct", [
      this.botUserId,
      userId,
    ]);
  }

  async getUser(userId: string): Promise<MattermostUser> {
    return this.api<MattermostUser>("GET", `/users/${userId}`);
  }

  private async api<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.url}/api/v4${path}`;
    this.log.debug(`${method} ${url}`);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      throw new Error(
        `Mattermost API ${method} ${path} failed: ${response.status} ${response.statusText} - ${text}`
      );
    }

    return response.json() as Promise<T>;
  }
}
