declare module 'bun' {
  type Env = {
    // Slack tokens
    SLACK_BOT_TOKEN: string
    SLACK_APP_TOKEN: string

    // GitHub token
    GITHUB_TOKEN: string

    // Database
    DATABASE_URL: string
    DATABASE_POOL_MAX?: string
    // Jobs
    POLL_CRON?: string
    DIGEST_CRON?: string
    CRON_TZ?: string
    SECURITY_RECHECK_HOURS?: string
  }
}
