import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import type { MattermostClient } from '../mattermost-client.js';

const PermissionRequestSchema = z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
});

export function registerPermissionRelay(
  server: Server,
  client: MattermostClient,
  config: { adminUsers: string[] }
): void {
  server.setNotificationHandler(PermissionRequestSchema, async (request) => {
    const { request_id, tool_name, description, input_preview } = request.params;

    const message = `🔐 **Permission Request / 권한 요청**
**Tool / 도구:** ${tool_name}
**Description / 설명:** ${description}
**Preview / 미리보기:** ${input_preview}

To approve / 승인: \`yes ${request_id}\`
To deny / 거부: \`no ${request_id}\``;

    // Send to each admin user
    for (const adminUserId of config.adminUsers) {
      try {
        // Create direct message channel with admin
        const dmChannel = await client.createDirectChannel(adminUserId);

        // Send the permission request message
        await client.createPost(dmChannel.id, message);
      } catch (error) {
        console.error(`Failed to send permission request to admin ${adminUserId}:`, error);
      }
    }
  });
}

export function parsePermissionVerdict(text: string): { requestId: string; behavior: 'allow' | 'deny' } | null {
  const match = text.match(/^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i);

  if (!match) {
    return null;
  }

  const [, verdict, requestId] = match;
  const behavior = verdict.toLowerCase() === 'y' || verdict.toLowerCase() === 'yes' ? 'allow' : 'deny';

  return {
    requestId: requestId.toLowerCase(),
    behavior,
  };
}

export function emitPermissionVerdict(
  server: Server,
  requestId: string,
  behavior: 'allow' | 'deny'
): void {
  server.notification({
    method: 'notifications/claude/channel/permission',
    params: { request_id: requestId, behavior },
  });
}
