import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ExecutionKind, ExecutionRecordRow } from './execution-refs.js'
import { getTurnExecutionContext } from './turn-execution-context.js'

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS execution_records (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL,
    turn_id TEXT,
    execution_id TEXT,
    kind TEXT NOT NULL,
    tool TEXT,
    ok INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_execution_records_turn
    ON execution_records (work_id, turn_id);
`

export function ensureExecutionRecordsSchema(db: DatabaseSync): void {
  db.exec(CREATE_SQL)
}

export function insertExecutionRecord(
  db: DatabaseSync,
  input: {
    workId: string
    turnId?: string | null
    executionId?: string | null
    kind: ExecutionKind
    tool?: string | null
    ok: boolean
  },
): string {
  ensureExecutionRecordsSchema(db)
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO execution_records (id, work_id, turn_id, execution_id, kind, tool, ok, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workId,
    input.turnId ?? null,
    input.executionId ?? null,
    input.kind,
    input.tool ?? null,
    input.ok ? 1 : 0,
    createdAt,
  )
  return id
}

/** Best-effort write using ALS turn context when workId/turnId not passed. */
export function recordTurnExecution(
  db: DatabaseSync | null | undefined,
  input: {
    kind: ExecutionKind
    tool?: string | null
    ok: boolean
    workId?: string | null
    turnId?: string | null
  },
): string | null {
  if (!db) return null
  const als = getTurnExecutionContext()
  const workId = input.workId || als?.workId
  if (!workId) return null
  try {
    return insertExecutionRecord(db, {
      workId,
      turnId: input.turnId ?? als?.turnId ?? null,
      kind: input.kind,
      tool: input.tool,
      ok: input.ok,
    })
  } catch {
    return null
  }
}

export function listExecutionRecordsForTurn(
  db: DatabaseSync,
  workId: string,
  turnId: string,
): ExecutionRecordRow[] {
  ensureExecutionRecordsSchema(db)
  const rows = db.prepare(
    `SELECT id, kind, tool, ok FROM execution_records
     WHERE work_id = ? AND turn_id = ?
     ORDER BY created_at ASC, rowid ASC`,
  ).all(workId, turnId) as Array<{ id: string; kind: string; tool: string | null; ok: number }>
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as ExecutionKind,
    tool: row.tool,
    ok: row.ok === 1,
  }))
}
