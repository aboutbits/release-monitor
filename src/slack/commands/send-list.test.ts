import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'
import { sendListMessages } from './send-list'
import type { RespondArguments } from '@slack/bolt'
import type { KnownBlock } from '@slack/types'

function messages(count: number): KnownBlock[][] {
  return Array.from({ length: count }, (_, i) => [
    { type: 'section', text: { type: 'mrkdwn', text: `message ${i}` } },
  ])
}

function context() {
  const replies: (string | RespondArguments)[] = []
  return {
    replies,
    ctx: {
      channelId: 'C123',
      respond: (message: string | RespondArguments) => {
        replies.push(message)
        return Promise.resolve()
      },
    },
  }
}

describe('sendListMessages', () => {
  let errorSpy: Mock<typeof console.error>

  beforeEach(() => {
    errorSpy = spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  test('sends one message as one reply', async () => {
    const { replies, ctx } = context()

    await sendListMessages(messages(1), 3, ctx)

    expect(replies).toEqual([
      { text: 'Subscriptions in this channel', blocks: messages(1)[0] },
    ])
  })

  test('sends 5 messages as 5 replies in their order', async () => {
    const { replies, ctx } = context()

    await sendListMessages(messages(5), 900, ctx)

    expect(replies).toEqual(
      messages(5).map((blocks) => ({
        text: 'Subscriptions in this channel',
        blocks,
      })),
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  test('sends one error reply instead of 6 messages and logs it', async () => {
    const { replies, ctx } = context()

    await sendListMessages(messages(6), 1100, ctx)

    expect(replies).toEqual([
      'This channel has 1100 subscriptions. That is too many to list in Slack.',
    ])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})
