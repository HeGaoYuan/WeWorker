import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath) {
  return fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', relativePath), 'utf8');
}

describe('sidepanel generation harness UX', () => {
  it('offers smart generation while retaining the quick scaffold path', () => {
    const html = readRepoFile('extension/sidepanel/sidepanel.html');
    const source = readRepoFile('extension/sidepanel/sidepanel.js');

    expect(html).toContain('id="btnExploreGenerate">智能生成</button>');
    expect(html).toContain('id="btnExploreQuickGenerate">快速生成</button>');
    expect(source).toContain("type: 'popup_explore_start_generation'");
    expect(source).toContain("data-generate-action=\"publish-run\"");
    expect(source).toContain('async function triggerQuickGenerate()');
    expect(source).toContain('运行验证：${runtimeValidation.passed');
    expect(source).toContain('Harness: ${escHtml(String(provenance.version');
    expect(source).toContain("if (saved.type !== 'workflow_loading' && saved.type !== 'workflow_ai_loading') return false;");
    expect(source).toContain("'action_capture_loading', 'action_capture_stopping', 'action_capture_ai_loading'");
    expect(source).toContain('async function removeGenerationRunId');
    expect(source).toContain("response.run.status !== 'awaiting_approval'");
    expect(source).toContain('const connected = await refreshBridgeStatus();');
    expect(source).toContain('setTimeout(() => pollGenerationRun(runId), 3000)');
    expect(source).toContain("error.code || 'RUNTIME_VALIDATION_ERROR'");
    expect(source).toContain('登录状态工具无需运行验证');
    expect(source).toContain('动作步数 ${Number(run.stepCount || 0)}');
    expect(html).toContain('#devStepPanelGenerate .explore-generate-result:not([hidden])');
    expect(html).toContain('flex: 1 1 240px;');
    expect(html).not.toContain('.explore-generate-result { margin-top: 10px; font-size: 11px; padding: 10px; border-radius: 4px; background: #11111b; border: 1px solid #313244; max-height: 200px;');
  });

  it('routes generation lifecycle requests through the extension service worker', () => {
    const source = readRepoFile('extension/background/service-worker.js');
    expect(source).toContain("msg.type === 'popup_explore_start_generation'");
    expect(source).toContain("type: 'start_generation_run'");
    expect(source).toContain("msg.type === 'popup_explore_publish_generation'");
    expect(source).toContain("type: 'publish_generation_run'");
  });
});
