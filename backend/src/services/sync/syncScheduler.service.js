// backend/src/services/sync/syncScheduler.service.js
// Recurring background synchronisation scheduler surviving application restarts.
// Reads SyncSchedule records from MySQL and schedules automated incremental syncs.

import cron from 'node-cron';
import prisma from '../../config/database.js';
import { syncOrchestratorService } from './syncOrchestrator.service.js';
import logger from '../../utils/logger.js';

let cronTasks = new Map();
const runningSchedules = new Set();

const STARTUP_CATCHUP_DELAY_MS = 60 * 1000;
const DEFAULT_INTERVAL_MINUTES = 720; // every 12 hours
// A run counts as "done for this interval" if it happened within the interval
// minus this slack, so the 02:00 cron and the hourly check don't both fire.
const DUE_SLACK_MS = 30 * 60 * 1000;
// After a failure, try again in about this long instead of waiting a full day
const RETRY_AFTER_FAILURE_MS = 2 * 60 * 60 * 1000;

/**
 * Convert interval in minutes into a standard cron expression.
 */
function intervalToCron(intervalMinutes) {
  if (intervalMinutes === 60) return '0 * * * *'; // Every hour
  if (intervalMinutes === 360) return '0 */6 * * *'; // Every 6 hours
  if (intervalMinutes === 720) return '0 */12 * * *'; // Every 12 hours
  return '0 2 * * *'; // Default: Daily at 02:00 UTC
}

export class SyncSchedulerService {
  /**
   * Bootstrap recurring background syncs on server start.
   */
  async initScheduler() {
    logger.info('Initializing automated background sync scheduler…');

    // Clean up any existing tasks
    for (const [key, task] of cronTasks.entries()) {
      task.stop();
    }
    cronTasks.clear();

    try {
      await this.ensureDefaultSchedules();

      const activeSchedules = await prisma.syncSchedule.findMany({
        where: { enabled: true },
        include: {
          website: true,
        },
      });

      logger.info(`Found ${activeSchedules.length} active synchronisation schedule(s) to register`);

      for (const schedule of activeSchedules) {
        this.registerCronTask(schedule);
      }

      // Hourly: pick up newly connected integrations and run any overdue schedules
      const universalJob = cron.schedule('15 * * * *', async () => {
        const created = await this.ensureDefaultSchedules();
        created.forEach((schedule) => this.registerCronTask(schedule));
        await this.runDueSchedules();
      });
      cronTasks.set('universal_scheduler_check', universalJob);

      // Catch up shortly after start-up: the fixed 02:00 UTC run is missed
      // whenever the server is down or asleep at that minute.
      const startupTimer = setTimeout(() => this.runDueSchedules(), STARTUP_CATCHUP_DELAY_MS);
      startupTimer.unref?.();
      cronTasks.set('startup_catchup', { stop: () => clearTimeout(startupTimer) });

      logger.info('Background sync scheduler successfully initialized.');
    } catch (err) {
      logger.warn(`Could not initialize sync scheduler: ${err.message}`);
    }
  }

  /**
   * Give every connected integration a daily schedule if it has none.
   * Without one, nothing syncs automatically: GSC/GA4 go stale and Clarity
   * (which only exports the last 1-3 days) never builds any history.
   * Schedules a user has turned off are left alone.
   *
   * @returns {Promise<object[]>} schedules created now
   */
  async ensureDefaultSchedules() {
    try {
      const [connections, schedules] = await Promise.all([
        prisma.integrationConnection.findMany({
          where: { status: { in: ['CONNECTED', 'SYNCING'] } },
          select: { id: true, websiteId: true, workspaceId: true, integrationType: true },
        }),
        prisma.syncSchedule.findMany({ select: { websiteId: true, provider: true } }),
      ]);

      const existing = new Set(schedules.map((s) => `${s.websiteId}:${s.provider}`));
      const created = [];
      for (const conn of connections) {
        if (existing.has(`${conn.websiteId}:${conn.integrationType}`)) continue;
        const schedule = await prisma.syncSchedule.create({
          data: {
            workspaceId: conn.workspaceId,
            websiteId: conn.websiteId,
            connectionId: conn.id,
            provider: conn.integrationType,
            enabled: true,
            // Twice a day: on a PC that is only on part of the day this still
            // syncs at least once per working session (Clarity: 2 of its 10 daily calls)
            intervalMinutes: DEFAULT_INTERVAL_MINUTES,
            timezone: 'UTC',
          },
        });
        existing.add(`${conn.websiteId}:${conn.integrationType}`);
        created.push(schedule);
      }

      if (created.length) {
        logger.info(`[SyncScheduler] Created ${created.length} default daily sync schedule(s)`);
      }
      return created;
    } catch (err) {
      logger.warn(`Could not create default sync schedules: ${err.message}`);
      return [];
    }
  }

  /**
   * Register a single cron job for a SyncSchedule.
   */
  registerCronTask(schedule) {
    const cronExpr = schedule.cronExpression || intervalToCron(schedule.intervalMinutes);
    if (!cron.validate(cronExpr)) {
      logger.warn(`Invalid cron expression "${cronExpr}" for schedule ${schedule.id}`);
      return;
    }

    const taskKey = `schedule:${schedule.id}`;
    if (cronTasks.has(taskKey)) {
      cronTasks.get(taskKey).stop();
    }

    const task = cron.schedule(
      cronExpr,
      async () => {
        logger.info(`[SyncScheduler] Triggering scheduled sync for ${schedule.provider} on website ${schedule.websiteId}`);
        await this.executeScheduledSync(schedule.id);
      },
      { timezone: schedule.timezone || 'UTC' }
    );

    cronTasks.set(taskKey, task);
    logger.info(`Registered cron task [${cronExpr}] for schedule ${schedule.id} (${schedule.provider})`);
  }

  /**
   * Execute an automated scheduled sync.
   */
  async executeScheduledSync(scheduleId) {
    // Guard against the 02:00 cron and the hourly catch-up firing together
    if (runningSchedules.has(scheduleId)) return;
    runningSchedules.add(scheduleId);

    try {
      const schedule = await prisma.syncSchedule.findUnique({
        where: { id: scheduleId },
      });
      if (!schedule || !schedule.enabled) return;
      if (!this.isDue(schedule) && !(await this.lastRunFailed(schedule))) {
        logger.info(`[SyncScheduler] ${schedule.provider} for website ${schedule.websiteId} already ran at ${schedule.lastRunAt.toISOString()}; skipping`);
        return;
      }

      const intervalMs = (schedule.intervalMinutes || DEFAULT_INTERVAL_MINUTES) * 60 * 1000;
      const startedAt = new Date();
      try {
        await syncOrchestratorService.triggerSync({
          workspaceId: schedule.workspaceId,
          websiteId: schedule.websiteId,
          provider: schedule.provider,
          jobType: 'SCHEDULED',
          // Clarity: always the last 24 hours, one stored day per run
          numOfDays: 1,
          user: { id: 'automated-scheduler', email: 'system@missive.internal' },
        });

        await prisma.syncSchedule.update({
          where: { id: scheduleId },
          data: {
            lastRunAt: startedAt,
            nextRunAt: new Date(startedAt.getTime() + intervalMs),
            // The job itself runs in the background; its own SyncJob row records the result
            lastStatus: 'PENDING',
          },
        });
        logger.info(`[SyncScheduler] Started scheduled ${schedule.provider} sync for website ${schedule.websiteId}`);
      } catch (err) {
        logger.error(`[SyncScheduler] Scheduled sync failed for ${schedule.provider}: ${err.message}`);
        // Record the attempt but make it due again in ~2 hours, so one bad
        // moment (network, token refresh) doesn't cost a whole day of data.
        const retryAt = new Date(startedAt.getTime() + RETRY_AFTER_FAILURE_MS);
        await prisma.syncSchedule
          .update({
            where: { id: scheduleId },
            data: {
              lastRunAt: new Date(retryAt.getTime() - intervalMs + DUE_SLACK_MS),
              nextRunAt: retryAt,
              lastStatus: 'FAILED',
            },
          })
          .catch(() => {});
      }
    } finally {
      runningSchedules.delete(scheduleId);
    }
  }

  /**
   * True when the background job started by the last scheduled run failed, or
   * has been stuck for over an hour (e.g. the server restarted mid-sync), and
   * that run was at least RETRY_AFTER_FAILURE_MS ago. Lets a bad run be
   * retried the same day instead of costing a day of Clarity data.
   */
  async lastRunFailed(schedule, now = Date.now()) {
    if (!schedule.lastRunAt) return false;
    const lastRun = new Date(schedule.lastRunAt).getTime();
    if (now - lastRun < RETRY_AFTER_FAILURE_MS) return false;

    const job = await prisma.syncJob.findFirst({
      where: { websiteId: schedule.websiteId, provider: schedule.provider, createdAt: { gte: new Date(lastRun - 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { status: true, updatedAt: true },
    });
    if (!job) return false;
    if (job.status === 'FAILED') return true;
    const stuck = ['PENDING', 'PROCESSING'].includes(job.status) && now - new Date(job.updatedAt).getTime() > 60 * 60 * 1000;
    return stuck;
  }

  /** True when a schedule hasn't run within its interval (missed runs included). */
  isDue(schedule, now = Date.now()) {
    if (!schedule.lastRunAt) return true;
    const intervalMs = (schedule.intervalMinutes || DEFAULT_INTERVAL_MINUTES) * 60 * 1000;
    return now - new Date(schedule.lastRunAt).getTime() >= intervalMs - DUE_SLACK_MS;
  }

  /**
   * Run every enabled schedule that is overdue: never run, or last run longer
   * ago than its interval. Called hourly and once shortly after start-up, so a
   * missed 02:00 run is caught up as soon as the server is back.
   */
  async runDueSchedules() {
    try {
      const schedules = await prisma.syncSchedule.findMany({ where: { enabled: true } });
      const due = [];
      for (const s of schedules) {
        if (this.isDue(s) || (await this.lastRunFailed(s))) due.push(s);
      }
      if (due.length) logger.info(`[SyncScheduler] Catching up ${due.length} overdue schedule(s)`);
      for (const schedule of due) {
        await this.executeScheduledSync(schedule.id);
      }
    } catch (err) {
      logger.warn(`Error running due schedules: ${err.message}`);
    }
  }

  /**
   * Update or create a sync schedule configuration for a website.
   */
  async updateSchedule({
    workspaceId,
    websiteId,
    provider,
    enabled,
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
    cronExpression,
    user,
  }) {
    const prov = provider.toUpperCase();

    // Verify website in workspace
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });

    if (!website) {
      throw new Error('Target website not found in this workspace.');
    }

    const schedule = await prisma.syncSchedule.upsert({
      where: {
        websiteId_provider: {
          websiteId,
          provider: prov,
        },
      },
      update: {
        enabled: enabled !== undefined ? enabled : true,
        intervalMinutes: Number(intervalMinutes),
        cronExpression: cronExpression || null,
      },
      create: {
        workspaceId,
        websiteId,
        provider: prov,
        enabled: enabled !== undefined ? enabled : true,
        intervalMinutes: Number(intervalMinutes),
        cronExpression: cronExpression || null,
      },
    });

    if (schedule.enabled) {
      this.registerCronTask(schedule);
    } else {
      const taskKey = `schedule:${schedule.id}`;
      if (cronTasks.has(taskKey)) {
        cronTasks.get(taskKey).stop();
        cronTasks.delete(taskKey);
      }
    }

    return schedule;
  }

  /**
   * Stop all active cron tasks for graceful shutdown.
   */
  stopScheduler() {
    logger.info('Stopping all background cron tasks…');
    for (const [key, task] of cronTasks.entries()) {
      task.stop();
    }
    cronTasks.clear();
  }
}

export const syncSchedulerService = new SyncSchedulerService();
export default syncSchedulerService;
