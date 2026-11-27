import { MAX_MESSAGES_PER_COMMAND } from '@bot/blocks/list'
import type { CommandContext } from './index'
import type { KnownBlock } from '@slack/types'

// Sends each message of the list as its own reply, or one error reply when Slack does not accept that many replies.
export async function sendListMessages(
  messages: KnownBlock[][],
  subscriptionCount: number,
  ctx: Pick<CommandContext, 'channelId' | 'respond'>,
): Promise<void> {
  if (messages.length > MAX_MESSAGES_PER_COMMAND) {
    console.error(
      `List for channel ${ctx.channelId} needs ${messages.length} messages, Slack allows ${MAX_MESSAGES_PER_COMMAND}`,
    )
    await ctx.respond(
      `This channel has ${subscriptionCount} subscriptions. That is too many to list in Slack.`,
    )
    return
  }

  for (const blocks of messages) {
    await ctx.respond({ text: 'Subscriptions in this channel', blocks })
  }
}
