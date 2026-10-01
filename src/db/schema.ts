import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export type NotificationMode = 'digest' | 'immediately' | 'security-only'

export const DB_SCHEMA = 'main'

const tableBuilder = pgSchema(DB_SCHEMA).table

export const repositories = tableBuilder(
  'repositories',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    forge: text('forge').notNull(),
    owner: text('owner').notNull(),
    repo: text('repo').notNull(),
    url: text('url'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    pollToken: text('poll_token'),
    lastKnownReleaseId: text('last_known_release_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique().on(t.forge, t.owner, t.repo)],
)

export const subscriptions = tableBuilder(
  'subscriptions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    channelId: text('channel_id').notNull(),
    repositoryId: bigint('repository_id', { mode: 'bigint' })
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    subscribedBy: text('subscribed_by').notNull(),
    notificationMode: text('notification_mode').notNull(),
  },
  (t) => [
    unique().on(t.channelId, t.repositoryId),
    index('idx_subscriptions_repository_id').on(t.repositoryId),
  ],
)

export const releases = tableBuilder(
  'releases',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    repositoryId: bigint('repository_id', { mode: 'bigint' })
      .notNull()
      .references(() => repositories.id, { onDelete: 'cascade' }),
    forgeReleaseId: text('forge_release_id').notNull(),
    tagName: text('tag_name').notNull(),
    name: text('name'),
    url: text('url').notNull(),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
    }).notNull(),
    // Last edit time reported by the forge, not the row update time. Do not
    // add $onUpdate: the re-check compares this value with the forge value.
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    isSecurity: boolean('is_security').notNull().default(false),
    securityScore: integer('security_score'),
    securityReasons: jsonb('security_reasons'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique().on(t.repositoryId, t.forgeReleaseId),
    index('idx_releases_repository_id_published_at').on(
      t.repositoryId,
      sql`${t.publishedAt} DESC`,
    ),
  ],
)

export const notifications = tableBuilder(
  'notifications',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    releaseId: bigint('release_id', { mode: 'bigint' })
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    channelId: text('channel_id').notNull(),
    kind: text('kind').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique().on(t.releaseId, t.channelId, t.kind),
    index('idx_notifications_channel_id').on(t.channelId),
  ],
)

export type Repository = typeof repositories.$inferSelect
export type Release = typeof releases.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
