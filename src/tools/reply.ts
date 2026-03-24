import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { MattermostClient } from '../mattermost-client.js';

export function registerReplyTool(server: Server, client: MattermostClient): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: 'reply',
      description: 'Send a message back to Mattermost. Use channel_id from the inbound <channel> tag.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          channel_id: { type: 'string', description: 'The Mattermost channel ID to reply in (from the channel tag)' },
          user_id: { type: 'string', description: 'If no channel_id, provide user_id to create a DM' },
          text: { type: 'string', description: 'The message to send' },
        },
        required: ['text'],
      },
    }],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === 'reply') {
      const { channel_id, user_id, text } = req.params.arguments as { channel_id?: string; user_id?: string; text: string };

      if (channel_id) {
        await client.createPost(channel_id, text);
      } else if (user_id) {
        const dm = await client.createDirectChannel(user_id);
        await client.createPost(dm.id, text);
      } else {
        return { content: [{ type: 'text' as const, text: 'Error: Either channel_id or user_id is required' }] };
      }

      return { content: [{ type: 'text' as const, text: 'sent' }] };
    }
    throw new Error(`unknown tool: ${req.params.name}`);
  });
}
