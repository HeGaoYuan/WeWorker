import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLikelyCommand, isNaturalLanguageInput } from '../utils/terminal-command-detection.js'

describe('terminal command detection', () => {
  it('treats webcli invocations as direct shell commands', () => {
    assert.equal(isLikelyCommand('webcli --help'), true)
    assert.equal(isLikelyCommand('webcli call open_browser --args \'{"url":"https://example.com"}\''), true)
    assert.equal(isNaturalLanguageInput('webcli --help'), false)
  })

  it('treats local executable-looking input as direct shell commands', () => {
    assert.equal(isLikelyCommand('java'), true)
    assert.equal(isLikelyCommand('java -version'), true)
    assert.equal(isLikelyCommand('javac -version'), true)
    assert.equal(isLikelyCommand('mvn -v'), true)
    assert.equal(isNaturalLanguageInput('java'), false)
  })

  it('keeps plain natural-language requests on the AI assistant path', () => {
    assert.equal(isLikelyCommand('帮我查看当前目录'), false)
    assert.equal(isNaturalLanguageInput('帮我查看当前目录'), true)
  })
})
