import fs from 'node:fs';
import {
  GENERATION_STATUSES,
  GenerationRun,
  GenerationRunStore,
} from '../../generation-harness/index.js';

const store = new GenerationRunStore();
let activeRun = null;

function send(message) {
  return new Promise((resolve) => process.send(message, () => resolve()));
}

function transitionToAwaitingApproval(run) {
  run.transition(GENERATION_STATUSES.CONTEXT_READY);
  run.transition(GENERATION_STATUSES.PLANNING);
  run.transition(GENERATION_STATUSES.DRAFTING);
  run.transition(GENERATION_STATUSES.STATIC_VALIDATING);
  run.transition(GENERATION_STATUSES.AWAITING_APPROVAL);
}

process.on('message', (message) => {
  if (message?.type === 'extension_response') {
    process.emit(`extension-response:${message.requestId}`, message);
    return;
  }
  if (message?.type !== 'command') return;

  void (async () => {
    if (message.command === 'cancel') {
      const run = activeRun || GenerationRun.restore({
        store,
        snapshot: store.load(message.payload.runId),
      });
      run.cancel(message.payload.reason);
      await send({ type: 'response', requestId: message.requestId, ok: true, runId: run.id });
      await send({ type: 'finished', runId: run.id, status: run.status });
      process.disconnect();
      return;
    }

    const payload = JSON.parse(fs.readFileSync(message.payloadPath, 'utf8'));
    if (message.command === 'publish') {
      const run = GenerationRun.restore({ store, snapshot: store.load(payload.runId) });
      run.transition(GENERATION_STATUSES.PUBLISHING);
      await send({ type: 'response', requestId: message.requestId, ok: true, runId: run.id });
      run.complete({ published: true });
      await send({ type: 'finished', runId: run.id, status: run.status });
      process.disconnect();
      return;
    }

    if (payload.input?.fixtureMode === 'extension') {
      const extensionRequestId = `fixture-${Date.now()}`;
      const response = new Promise((resolve) => {
        process.once(`extension-response:${extensionRequestId}`, resolve);
      });
      await send({
        type: 'extension_request',
        requestId: extensionRequestId,
        request: { type: 'validate_generation_preview', fixture: true },
        timeout: 5_000,
      });
      const extensionResult = await response;
      if (!extensionResult.ok) throw new Error(extensionResult.error);
    }

    activeRun = GenerationRun.create({
      store,
      id: payload.runId,
      siteKey: payload.siteKey,
      goal: payload.goal,
      input: payload.input,
      onEvent: (event) => void send({ type: 'event', event }),
    });
    activeRun.transition(GENERATION_STATUSES.CONTEXT_READY);
    activeRun.transition(GENERATION_STATUSES.PLANNING);
    if (payload.input?.fixtureMode === 'crashBeforeResponse') {
      process.exit(10);
    }
    await send({ type: 'response', requestId: message.requestId, ok: true, runId: activeRun.id });

    if (payload.input?.fixtureMode === 'crash') {
      setTimeout(() => process.exit(9), 20);
      return;
    }
    if (payload.input?.fixtureMode === 'hang') return;

    activeRun.transition(GENERATION_STATUSES.DRAFTING);
    activeRun.transition(GENERATION_STATUSES.STATIC_VALIDATING);
    activeRun.transition(GENERATION_STATUSES.AWAITING_APPROVAL);
    await send({ type: 'finished', runId: activeRun.id, status: activeRun.status });
    process.disconnect();
  })();
});
