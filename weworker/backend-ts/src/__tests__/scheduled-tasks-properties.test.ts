/**
 * **Feature: scheduled-tasks, Property 1: 定时任务数据持久化往返**
 *
 * For any valid scheduled task configuration, creating a task and reading it back
 * should return equivalent data with all fields consistent. Similarly, creating
 * a task execution and querying the execution list should contain that record
 * with correct fields.
 *
 * **Validates: Requirements 1.1, 1.2, 8.1, 8.2, 8.3**
 */
import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import {
  _initTestDb,
  _getTestDb,
  createScheduledTask,
  getScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  createWork,
  createTaskExecution,
  updateTaskExecution,
  listTaskExecutions,
} from '../works-store.js'

// A set of known valid cron expressions for generation
const VALID_CRONS = [
  '* * * * *',
  '0 * * * *',
  '0 0 * * *',
  '0 2 * * *',
  '0 9 * * 1',
  '*/5 * * * *',
  '*/15 * * * *',
  '*/30 * * * *',
  '0 0 1 * *',
  '0 12 * * 1-5',
  '30 8 * * *',
  '0 0 * * 0',
  '0 6,18 * * *',
  '0 0 1 1 *',
]

// Arbitrary for generating a non-empty printable string (title, prompt, channel names)
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0)

// Arbitrary for a valid cron expression
const arbCron = fc.constantFrom(...VALID_CRONS)

// Arbitrary for notify_channels: array of 0-5 unique non-empty strings
const arbChannels = fc.uniqueArray(
  fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)),
  { minLength: 0, maxLength: 5 }
)

// Arbitrary for a scheduled task input
const arbTaskInput = fc.record({
  title: arbNonEmptyString,
  cron_expression: arbCron,
  prompt_template: arbNonEmptyString,
  enabled: fc.boolean(),
  notify_channels: arbChannels,
})

describe('Property 1: 定时任务数据持久化往返', () => {
  beforeEach(() => {
    _initTestDb()
  })

  it('creating a scheduled task and reading it back should preserve all fields', () => {
    fc.assert(
      fc.property(arbTaskInput, (input) => {
        const created = createScheduledTask(input)

        // Verify returned object from create
        expect(created.title).toBe(input.title)
        expect(created.cron_expression).toBe(input.cron_expression)
        expect(created.prompt_template).toBe(input.prompt_template)
        expect(created.enabled).toBe(input.enabled)
        expect(created.notify_channels).toEqual(input.notify_channels)
        expect(created.id).toBeTruthy()
        expect(created.created_at).toBeTruthy()
        expect(created.updated_at).toBeTruthy()

        // Read back from DB and verify round-trip
        const fetched = getScheduledTask(created.id)
        expect(fetched).not.toBeNull()
        expect(fetched!.id).toBe(created.id)
        expect(fetched!.title).toBe(input.title)
        expect(fetched!.cron_expression).toBe(input.cron_expression)
        expect(fetched!.prompt_template).toBe(input.prompt_template)
        expect(fetched!.enabled).toBe(input.enabled)
        expect(fetched!.notify_channels).toEqual(input.notify_channels)
        expect(fetched!.created_at).toBe(created.created_at)
        expect(fetched!.updated_at).toBe(created.updated_at)
      }),
      { numRuns: 100 }
    )
  })

  it('creating a task execution and listing it should preserve all fields', () => {
    fc.assert(
      fc.property(arbTaskInput, (input) => {
        // Create a task and a work to associate the execution with
        const task = createScheduledTask(input)
        const work = createWork('test-work')

        const execution = createTaskExecution(task.id, work.id)

        // Verify returned execution
        expect(execution.id).toBeTruthy()
        expect(execution.task_id).toBe(task.id)
        expect(execution.work_id).toBe(work.id)
        expect(execution.status).toBe('pending')
        expect(execution.started_at).toBeTruthy()

        // List executions and verify the record is present with correct fields
        const executions = listTaskExecutions(task.id)
        expect(executions.length).toBeGreaterThanOrEqual(1)

        const found = executions.find((e) => e.id === execution.id)
        expect(found).toBeDefined()
        expect(found!.task_id).toBe(task.id)
        expect(found!.work_id).toBe(work.id)
        expect(found!.status).toBe('pending')
        expect(found!.started_at).toBe(execution.started_at)
      }),
      { numRuns: 100 }
    )
  })
})


/**
 * **Feature: scheduled-tasks, Property 2: 级联删除完整性**
 *
 * For any scheduled task and its associated execution records (0-10),
 * deleting the task should remove both the task and all associated
 * execution records from the database.
 *
 * **Validates: Requirements 1.4, 6.2, 8.5**
 */
describe('Property 2: 级联删除完整性', () => {
  beforeEach(() => {
    _initTestDb()
  })

  it('deleting a task should remove the task and all associated execution records', () => {
    fc.assert(
      fc.property(
        arbTaskInput,
        fc.integer({ min: 0, max: 10 }),
        (input, executionCount) => {
          // Create the task
          const task = createScheduledTask(input)

          // Create 0-10 execution records, each needing a work
          for (let i = 0; i < executionCount; i++) {
            const work = createWork(`exec-work-${i}`)
            createTaskExecution(task.id, work.id)
          }

          // Verify executions were created
          const executionsBefore = listTaskExecutions(task.id)
          expect(executionsBefore.length).toBe(executionCount)

          // Delete the task
          deleteScheduledTask(task.id)

          // Verify task no longer exists
          const deletedTask = getScheduledTask(task.id)
          expect(deletedTask).toBeNull()

          // Verify all execution records are gone
          const executionsAfter = listTaskExecutions(task.id)
          expect(executionsAfter).toEqual([])
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * **Feature: scheduled-tasks, Property 7: 执行记录时间倒序**
 *
 * For any scheduled task's execution record list, records should be ordered
 * by started_at in descending order, i.e. for each consecutive pair,
 * list[i].started_at >= list[i+1].started_at.
 *
 * **Validates: Requirements 5.1**
 */
describe('Property 7: 执行记录时间倒序', () => {
  beforeEach(() => {
    _initTestDb()
  })

  // Generate a random ISO timestamp within a reasonable range (year 2020-2030)
  const arbTimestamp = fc
    .integer({
      min: new Date('2020-01-01T00:00:00Z').getTime(),
      max: new Date('2030-12-31T23:59:59Z').getTime(),
    })
    .map((ms) => new Date(ms).toISOString())

  it('listTaskExecutions should return records ordered by started_at DESC', () => {
    fc.assert(
      fc.property(
        arbTaskInput,
        fc.array(arbTimestamp, { minLength: 2, maxLength: 20 }),
        (input, timestamps) => {
          // Create a task
          const task = createScheduledTask(input)
          const db = _getTestDb()

          // Create execution records and update their started_at to random timestamps
          const executionIds: string[] = []
          for (const ts of timestamps) {
            const work = createWork(`exec-work`)
            const execution = createTaskExecution(task.id, work.id)
            executionIds.push(execution.id)

            // Directly update started_at via SQL to set the random timestamp
            db.prepare('UPDATE task_executions SET started_at = ? WHERE id = ?').run(
              ts,
              execution.id
            )
          }

          // Query the list and verify DESC ordering by started_at
          const executions = listTaskExecutions(task.id)
          expect(executions.length).toBe(timestamps.length)

          for (let i = 0; i < executions.length - 1; i++) {
            const current = executions[i].started_at!
            const next = executions[i + 1].started_at!
            expect(current >= next).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * **Feature: scheduled-tasks, Property 8: 部分更新保留未修改字段**
 *
 * For any existing scheduled task and any valid partial update (containing one or more
 * of title, cron_expression, prompt_template, enabled, notify_channels), after PATCH,
 * updated fields should reflect new values, non-updated fields should retain original values.
 *
 * **Validates: Requirements 8.4**
 */
describe('Property 8: 部分更新保留未修改字段', () => {
  beforeEach(() => {
    _initTestDb()
  })

  // Arbitrary for generating a partial update with at least one field present
  const arbPartialUpdate = fc
    .record(
      {
        title: arbNonEmptyString,
        cron_expression: arbCron,
        prompt_template: arbNonEmptyString,
        enabled: fc.boolean(),
        notify_channels: arbChannels,
      },
      { requiredKeys: [] }
    )
    .filter(
      (u) =>
        u.title !== undefined ||
        u.cron_expression !== undefined ||
        u.prompt_template !== undefined ||
        u.enabled !== undefined ||
        u.notify_channels !== undefined
    )

  it('partial update should change only the specified fields and preserve the rest', () => {
    fc.assert(
      fc.property(arbTaskInput, arbPartialUpdate, (input, updates) => {
        // Create the original task
        const original = createScheduledTask(input)

        // Apply partial update
        const updated = updateScheduledTask(original.id, updates)
        expect(updated).not.toBeNull()

        // Verify updated fields reflect new values
        if (updates.title !== undefined) {
          expect(updated!.title).toBe(updates.title)
        }
        if (updates.cron_expression !== undefined) {
          expect(updated!.cron_expression).toBe(updates.cron_expression)
        }
        if (updates.prompt_template !== undefined) {
          expect(updated!.prompt_template).toBe(updates.prompt_template)
        }
        if (updates.enabled !== undefined) {
          expect(updated!.enabled).toBe(updates.enabled)
        }
        if (updates.notify_channels !== undefined) {
          expect(updated!.notify_channels).toEqual(updates.notify_channels)
        }

        // Verify non-updated fields retain original values
        if (updates.title === undefined) {
          expect(updated!.title).toBe(original.title)
        }
        if (updates.cron_expression === undefined) {
          expect(updated!.cron_expression).toBe(original.cron_expression)
        }
        if (updates.prompt_template === undefined) {
          expect(updated!.prompt_template).toBe(original.prompt_template)
        }
        if (updates.enabled === undefined) {
          expect(updated!.enabled).toBe(original.enabled)
        }
        if (updates.notify_channels === undefined) {
          expect(updated!.notify_channels).toEqual(original.notify_channels)
        }

        // id and created_at must never change
        expect(updated!.id).toBe(original.id)
        expect(updated!.created_at).toBe(original.created_at)

        // updated_at should be >= original (may equal if within same millisecond)
        expect(updated!.updated_at >= original.updated_at).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})


/**
 * **Feature: scheduled-tasks, Property 6: 执行状态跟踪**
 *
 * For any triggered scheduled task, the system should create a new work record
 * and a TaskExecution record. If execution succeeds, status should be 'completed'
 * with a valid completed_at timestamp >= started_at and no error_message.
 * If execution fails, status should be 'failed' with a non-empty error_message
 * and a valid completed_at timestamp >= started_at.
 *
 * **Validates: Requirements 4.1, 4.3, 4.4**
 */
describe('Property 6: 执行状态跟踪', () => {
  beforeEach(() => {
    _initTestDb()
  })

  // Arbitrary for a non-empty error message
  const arbErrorMessage = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0)

  it('execution status tracking: success sets completed with valid timestamps, failure sets failed with error_message', () => {
    fc.assert(
      fc.property(
        arbTaskInput,
        fc.boolean(), // true = success, false = failure
        arbErrorMessage,
        (input, isSuccess, errorMessage) => {
          // 1. Create a task and a work
          const task = createScheduledTask(input)
          const work = createWork('execution-work')

          // 2. Create a task execution (starts as 'pending')
          const execution = createTaskExecution(task.id, work.id)
          expect(execution.status).toBe('pending')
          expect(execution.started_at).toBeTruthy()

          // 3. Update to 'running'
          updateTaskExecution(execution.id, { status: 'running' })

          // Verify running state
          const runningList = listTaskExecutions(task.id)
          const runningExec = runningList.find((e) => e.id === execution.id)!
          expect(runningExec.status).toBe('running')

          // 4. Randomly choose success or failure
          const completedAt = new Date().toISOString()

          if (isSuccess) {
            // Success: update to 'completed' with completed_at timestamp
            updateTaskExecution(execution.id, {
              status: 'completed',
              completed_at: completedAt,
            })

            // Verify completed state
            const completedList = listTaskExecutions(task.id)
            const completedExec = completedList.find((e) => e.id === execution.id)!

            expect(completedExec.status).toBe('completed')
            // completed_at should be a valid ISO timestamp
            expect(completedExec.completed_at).toBeTruthy()
            expect(new Date(completedExec.completed_at!).toISOString()).toBe(
              completedExec.completed_at
            )
            // completed_at >= started_at
            expect(completedExec.completed_at! >= completedExec.started_at!).toBe(true)
            // No error_message for success
            expect(completedExec.error_message).toBeUndefined()
          } else {
            // Failure: update to 'failed' with error_message and completed_at
            updateTaskExecution(execution.id, {
              status: 'failed',
              error_message: errorMessage,
              completed_at: completedAt,
            })

            // Verify failed state
            const failedList = listTaskExecutions(task.id)
            const failedExec = failedList.find((e) => e.id === execution.id)!

            expect(failedExec.status).toBe('failed')
            // error_message should be a non-empty string
            expect(failedExec.error_message).toBeTruthy()
            expect(typeof failedExec.error_message).toBe('string')
            expect(failedExec.error_message!.length).toBeGreaterThan(0)
            // completed_at should be a valid ISO timestamp
            expect(failedExec.completed_at).toBeTruthy()
            expect(new Date(failedExec.completed_at!).toISOString()).toBe(
              failedExec.completed_at
            )
            // completed_at >= started_at
            expect(failedExec.completed_at! >= failedExec.started_at!).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
