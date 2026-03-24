#!/usr/bin/env node
// Run with: node --import tsx src/index.ts

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { appendFileSync } from 'node:fs';
import { loadConfig, type Config } from './config.js';

let logFile: string | undefined;

const log = (msg: string) => {
  const line = `[${new Date().toISOString()}] [handler] ${msg}\n`;
  process.stderr.write(line);
  if (logFile) appendFileSync(logFile, line);
};
import { MattermostClient, type MattermostEvent, type MattermostPost } from './mattermost-client.js';
import { registerReplyTool } from './tools/reply.js';
import { registerPermissionRelay, parsePermissionVerdict, emitPermissionVerdict } from './tools/permission.js';

async function main() {
  // 1. Load config
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`Failed to load config: ${err}\n`);
    process.exit(1);
  }

  logFile = config.logFile;

  // 2. Create MCP Server
  const mcp = new Server(
    {
      name: 'mattermost-channel',
      version: '0.1.0',
    },
    {
      capabilities: {
        experimental: {
          'claude/channel': {},
          'claude/channel/permission': {},
        },
        tools: {},
      },
      instructions: `
You are connected to a Mattermost channel via the mattermost-channel MCP server.

Messages from Mattermost users arrive as notifications in this format:
  <channel source="mattermost-channel" user_id="..." username="..." channel_id="...">message content</channel>

How to respond:
- Use the \`reply\` MCP tool to send messages back to the user or channel.
- Pass \`user_id\` to send a direct message to the user.
- Pass \`channel_id\` to post in the channel where the message originated.
- Extract these values from the XML tag attributes of the incoming message.

Permission prompts:
- Permission requests arrive as DM notifications.
- Respond with "yes" or "no" as directed in the prompt.
- Use the \`reply\` tool to send your permission decision.

---

Mattermost 채널에 연결되었습니다 (mattermost-channel MCP 서버를 통해).

Mattermost 사용자의 메시지는 다음 형식으로 도착합니다:
  <channel source="mattermost-channel" user_id="..." username="..." channel_id="...">메시지 내용</channel>

응답 방법:
- \`reply\` MCP 도구를 사용하여 사용자 또는 채널에 메시지를 보내세요.
- \`user_id\`를 전달하면 해당 사용자에게 DM을 보냅니다.
- \`channel_id\`를 전달하면 메시지가 도착한 채널에 게시합니다.
- 이 값들은 수신 메시지의 XML 태그 속성에서 가져오세요.

권한 프롬프트:
- 권한 요청은 DM 알림으로 도착합니다.
- 프롬프트의 지시에 따라 "yes" 또는 "no"로 응답하세요.
- \`reply\` 도구를 사용하여 권한 결정을 보내세요.
`.trim(),
    }
  );

  // 3. Register tools
  const client = new MattermostClient(config.mattermostUrl, config.mattermostToken, config.logLevel, config.logFile);
  registerReplyTool(mcp, client);
  registerPermissionRelay(mcp, client, { adminUsers: config.adminUsers });

  // 4. Connect MCP server via stdio
  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  // 5. Get bot's own user info
  let botUserId: string;
  try {
    const me = await client.getMe();
    botUserId = me.id;
    process.stderr.write(`Mattermost Claude Channel connected as @${me.username}\n`);
  } catch (err) {
    process.stderr.write(`Failed to get bot user info: ${err}\n`);
    process.exit(1);
  }

  // 6. Set up message handler
  client.onMessage(async (event: MattermostEvent) => {
    // Filter: only handle "posted" events
    if (event.event !== 'posted') {
      return;
    }

    // Post is already parsed by mattermost-client (string → MattermostPost)
    const post = event.data.post as MattermostPost;
    log(`posted event: post=${!!post}, user_id=${post?.user_id}, channel_id=${post?.channel_id}, message=${post?.message?.substring(0, 50)}`);
    if (!post || !post.user_id) { log('SKIP: no post or user_id'); return; }

    // Check if this is a permission verdict from an admin (before any filters)
    if (config.adminUsers.length > 0 && config.adminUsers.includes(post.user_id)) {
      const verdict = parsePermissionVerdict(post.message);
      if (verdict) {
        log(`Permission verdict from admin ${post.user_id}: ${verdict.behavior} ${verdict.requestId}`);
        await emitPermissionVerdict(mcp, verdict.requestId, verdict.behavior);
        return;
      }
    }

    // Skip own messages
    if (post.user_id === botUserId) {
      log(`SKIP: own message (botUserId=${botUserId})`);
      return;
    }

    // Filter by listen channels (if configured)
    if (config.listenChannels.length > 0 && !config.listenChannels.includes(post.channel_id)) {
      log(`SKIP: channel ${post.channel_id} not in listenChannels [${config.listenChannels}]`);
      return;
    }

    // Check sender allowlist
    if (config.allowedUsers && config.allowedUsers.length > 0) {
      if (!config.allowedUsers.includes(post.user_id)) {
        log(`SKIP: user ${post.user_id} not in allowedUsers`);
        return;
      }
    }

    // Get sender info
    let sender: { username: string };
    try {
      sender = await client.getUser(post.user_id);
    } catch (err) {
      process.stderr.write(`Failed to get user info for ${post.user_id}: ${err}\n`);
      sender = { username: post.user_id };
    }

    // Push to Claude via notification
    log(`SENDING notification: user=${sender.username}, channel=${post.channel_id}, message=${post.message?.substring(0, 50)}`);
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: post.message,
        meta: {
          user_id: post.user_id,
          username: sender.username,
          channel_id: post.channel_id,
          channel_type: (event.data.channel_type as string) || 'D',
        },
      },
    });
  });

  // 7. Connect to Mattermost
  try {
    await client.connect();
  } catch (err) {
    process.stderr.write(`Mattermost connection error: ${err}\n`);
    // Client handles reconnection internally
  }

  // 8. Graceful shutdown
  const shutdown = async () => {
    process.stderr.write('Shutting down...\n');
    await client.disconnect?.();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
