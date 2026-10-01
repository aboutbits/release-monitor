import { timeZone } from '@utils/env'

/** Time zone of the cron schedules and of the dates in the digest. */
export const CRON_TZ = timeZone('CRON_TZ', 'UTC')
