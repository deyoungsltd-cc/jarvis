/**
 * Scheduler Service — Round 2
 *
 * setInterval-based task scheduler with minimal cron parsing.
 * Persists schedule definitions to data/schedules.json.
 * When a schedule fires, it creates a Mission and runs the AgentLoop.
 */
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/api/logger';
import * as fs from 'fs';
import * as path from 'path';

// ---- Types ----

export interface ScheduleTask {
  id: string;
  name: string;
  cronExpression: string | null; // e.g. "*/5 * * * *"
  intervalMs: number | null;     // fallback if cronExpression is null
  goal: string;                  // the mission goal
  provider: string;              // LLM provider to use
  enabled: boolean;
  lastRunAt: string | null;     // ISO date
  nextRunAt: string | null;     // ISO date
  runCount: number;
  createdAt: string;
}

export interface CreateScheduleOpts {
  name: string;
  cronExpression?: string;
  intervalMs?: number;
  goal: string;
  provider?: string;
}

// ---- Constants ----

const PERSIST_PATH = path.resolve(process.cwd(), 'data', 'schedules.json');
const CHECK_INTERVAL_MS = 15_000; // check every 15 seconds

// ---- Cron Parser (minimal) ----

/**
 * Minimal cron parser supporting common patterns:
 *   */5 * * * *     — every 5 minutes
 *   0 9 * * *       — daily at 9:00 AM
 *   30 * * * *      — every hour at :30
 *   0 0 * * 1       — weekly on Monday at midnight
 *
 * Returns: next Date when the cron should fire.
 */
function parseCronNext(cron: string, after?: Date): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression (expected 5 fields): ${cron}`);
  }

  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;
  const now = after || new Date();
  const candidate = new Date(now.getTime() + 60_000); // start checking 1 min from now

  // We'll iterate minute-by-minute (up to a year) to find next match
  const maxIterations = 525_600; // 1 year in minutes
  for (let i = 0; i < maxIterations; i++) {
    candidate.setSeconds(0, 0);

    if (
      matchesField(minPart, candidate.getMinutes(), 0, 59) &&
      matchesField(hourPart, candidate.getHours(), 0, 23) &&
      matchesField(domPart, candidate.getDate(), 1, 31) &&
      matchesField(monthPart, candidate.getMonth() + 1, 1, 12) &&
      matchesField(dowPart, candidate.getDay() === 0 ? 7 : candidate.getDay(), 0, 7)
    ) {
      return new Date(candidate);
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // Fallback: 1 hour from now
  return new Date(Date.now() + 3_600_000);
}

function matchesField(pattern: string, value: number, min: number, max: number): boolean {
  if (pattern === '*') return true;

  // */N pattern
  const stepMatch = pattern.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1], 10);
    return value % step === 0;
  }

  // Specific value
  const num = parseInt(pattern, 10);
  if (!isNaN(num)) return num === value;

  // Comma-separated values
  const values = pattern.split(',').map(s => parseInt(s.trim(), 10));
  return values.some(v => v === value);
}

// ---- Scheduler Service ----

class SchedulerService {
  private tasks: Map<string, ScheduleTask> = new Map();
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.load();
    this.startChecker();
  }

  // ---- Persistence ----

  private ensureDataDir() {
    const dir = path.dirname(PERSIST_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load() {
    try {
      if (fs.existsSync(PERSIST_PATH)) {
        const raw = fs.readFileSync(PERSIST_PATH, 'utf-8');
        const arr: ScheduleTask[] = JSON.parse(raw);
        for (const t of arr) {
          this.tasks.set(t.id, t);
          if (t.enabled) {
            this.startTaskTimer(t);
          }
        }
        logger.info('scheduler', `Loaded ${arr.length} scheduled tasks`);
      }
    } catch (err) {
      logger.error('scheduler', `Failed to load schedules: ${err}`);
    }
  }

  private save() {
    try {
      this.ensureDataDir();
      const arr = Array.from(this.tasks.values());
      fs.writeFileSync(PERSIST_PATH, JSON.stringify(arr, null, 2));
    } catch (err) {
      logger.error('scheduler', `Failed to save schedules: ${err}`);
    }
  }

  // ---- Timer Management ----

  private startTaskTimer(task: ScheduleTask) {
    // Stop existing timer if any
    this.stopTaskTimer(task.id);

    const ms = task.intervalMs || 60_000;

    // For interval-based schedules
    if (task.intervalMs) {
      const timer = setInterval(() => {
        this.fireTask(task.id);
      }, task.intervalMs);
      this.timers.set(task.id, timer);
    }
  }

  private stopTaskTimer(id: string) {
    const existing = this.timers.get(id);
    if (existing) {
      clearInterval(existing);
      this.timers.delete(id);
    }
  }

  private startChecker() {
    // Every 15 seconds, check if any cron-based tasks should fire
    this.checkTimer = setInterval(() => {
      const now = new Date();
      for (const task of this.tasks.values()) {
        if (!task.enabled) continue;
        if (!task.cronExpression) continue;

        const nextRun = task.nextRunAt ? new Date(task.nextRunAt) : null;
        if (nextRun && now >= nextRun) {
          this.fireTask(task.id);
        }
      }
    }, CHECK_INTERVAL_MS);
  }

  private updateNextRun(task: ScheduleTask) {
    if (task.cronExpression) {
      const next = parseCronNext(task.cronExpression);
      task.nextRunAt = next.toISOString();
    } else if (task.intervalMs) {
      task.nextRunAt = new Date(Date.now() + task.intervalMs).toISOString();
    }
  }

  // ---- Fire Task ----

  private async fireTask(id: string) {
    const task = this.tasks.get(id);
    if (!task || !task.enabled) return;

    logger.info('scheduler', `Firing scheduled task: ${task.name} (${id})`);
    task.lastRunAt = new Date().toISOString();
    task.runCount++;

    // Update next run time
    this.updateNextRun(task);
    this.save();

    try {
      // Dynamically import to avoid circular deps
      const { missionService } = await import('./missionService.js');
      const mission = await missionService.create(
        { goal: task.goal },
        `scheduler:${id}`,
      );
      logger.info('scheduler', `Created mission ${mission.id} for scheduled task ${task.name}`);
    } catch (err) {
      logger.error('scheduler', `Failed to create mission for task ${task.name}: ${err}`);
    }
  }

  // ---- Public API ----

  createSchedule(opts: CreateScheduleOpts): ScheduleTask {
    const task: ScheduleTask = {
      id: uuidv4(),
      name: opts.name,
      cronExpression: opts.cronExpression || null,
      intervalMs: opts.intervalMs || null,
      goal: opts.goal,
      provider: opts.provider || 'gemini',
      enabled: true,
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
      createdAt: new Date().toISOString(),
    };

    // Validate: must have cron or interval
    if (!task.cronExpression && !task.intervalMs) {
      throw new Error('Either cronExpression or intervalMs is required');
    }

    // Calculate next run
    this.updateNextRun(task);

    this.tasks.set(task.id, task);
    this.startTaskTimer(task);
    this.save();

    logger.info('scheduler', `Created scheduled task: ${task.name} (${task.id})`);
    return task;
  }

  removeSchedule(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    this.stopTaskTimer(id);
    this.tasks.delete(id);
    this.save();

    logger.info('scheduler', `Removed scheduled task: ${task.name} (${id})`);
    return true;
  }

  toggleSchedule(id: string): ScheduleTask | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    task.enabled = !task.enabled;

    if (task.enabled) {
      this.updateNextRun(task);
      this.startTaskTimer(task);
      logger.info('scheduler', `Enabled scheduled task: ${task.name}`);
    } else {
      this.stopTaskTimer(id);
      task.nextRunAt = null;
      logger.info('scheduler', `Disabled scheduled task: ${task.name}`);
    }

    this.save();
    return task;
  }

  listSchedules(): ScheduleTask[] {
    return Array.from(this.tasks.values());
  }

  async runNow(id: string): Promise<ScheduleTask | null> {
    const task = this.tasks.get(id);
    if (!task) return null;

    await this.fireTask(id);
    return this.tasks.get(id) || null;
  }

  /** Stop all timers (for shutdown) */
  shutdown() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    logger.info('scheduler', 'Scheduler shut down');
  }
}

// ---- Singleton ----

let instance: SchedulerService | null = null;

export function getScheduler(): SchedulerService {
  if (!instance) {
    instance = new SchedulerService();
  }
  return instance;
}

export { SchedulerService };
