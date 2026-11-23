// backend/src/services/sync/syncScheduler.service.js
// Recurring background synchronisation scheduler surviving application restarts.
// Reads SyncSchedule records from MySQL and schedules automated incremental syncs.

import cron from 'node-cron';
import prisma from '../../config/database.js';
import { syncOrchestratorService } from './syncOrchestrator.service.js';
import logger from '../../utils/logger.js';

let cronTasks = new Map();

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

      // Also register a universal fallback hourly check to run due schedules
      const universalJob = cron.schedule('15 * * * *', () => {
        this.runDueSchedules();
      });
      cronTasks.set('universal_scheduler_check', universalJob);

      logger.info('Background sync scheduler successfully initialized.');
    } catch (err) {
      logger.warn(`Could not initialize sync scheduler: ${err.message}`);
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

    const task = cron.schedule(cronExpr, async () => {
      logger.info(`[SyncScheduler] Triggering scheduled sync for ${schedule.provider} on website ${schedule.websiteId}`);
      await this.executeScheduledSync(schedule.id);
    });

    cronTasks.set(taskKey, task);
    logger.info(`Registered cron task [${cronExpr}] for schedule ${schedule.id} (${schedule.provider})`);
  }

  /**
   * Execute an automated scheduled sync.
   */
  async executeScheduledSync(scheduleId) {
    const schedule = await prisma.syncSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || !schedule.enabled) return;

    try {
      await syncOrchestratorService.triggerSync({
        workspaceId: schedule.workspaceId,
        websiteId: schedule.websiteId,
        provider: schedule.provider,
        jobType: 'SCHEDULED',
        user: { id: 'automated-scheduler', email: 'system@missive.internal' },
      });

      await prisma.syncSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'COMPLETED',
        },
      });
    } catch (err) {
      logger.error(`[SyncScheduler] Scheduled sync failed for ${schedule.provider}: ${err.message}`);
      await prisma.syncSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'FAILED',
        },
      }).catch(() => {});
    }
  }

  /**
   * Check for any enabled schedules whose nextRunAt has passed.
   */
  async runDueSchedules() {
    try {
      const now = new Date();
      const dueSchedules = await prisma.syncSchedule.findMany({
        where: {
          enabled: true,
          nextRunAt: { lte: now },
        },
      });

      for (const schedule of dueSchedules) {
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
    intervalMinutes = 1440,
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
