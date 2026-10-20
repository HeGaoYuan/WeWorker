/** Steering splits the visible reply at its arrival point, keeping prior output above it. */
export function insertSteeringIntoMessages(messages, message, previousAssistant) {
  if (!message?.id || messages.some(item => item.id === message.id)) return messages
  const previous = messages.at(-1)
  const turnId = previous?.streamingTurnId || previous?.id || message.id
  let before = messages
  if (previous?.role === 'assistant') {
    if (previousAssistant) {
      // The ordered SSE checkpoint reconciles stored IDs and content at the split.
      const choices = (previous.content || []).filter(block => block.type === 'user_choice')
      before = [...messages.slice(0, -1), { ...previousAssistant, streamingTurnId: turnId, content: [...previousAssistant.content, ...choices] }]
    } else if (!previous.content?.length) {
      before = messages.slice(0, -1)
    }
  }
  return [...before, message, { id: message.id + '-continuation', role: 'assistant', content: [], streamingTurnId: turnId, created_at: message.created_at }]
}

/** Tool results may arrive after a steering bubble split their original reply. */
export function updateAssistantMessages(messages, event, updater) {
  let index = messages.length - 1
  if (event?.id && (event.type?.startsWith('tool_call_') || event.type === 'user_choice_answer')) {
    const type = event.type === 'user_choice_answer' ? 'user_choice' : 'tool_use'
    const owner = messages.findLastIndex(message => message.role === 'assistant' && message.content?.some(block => block.type === type && block.id === event.id))
    if (owner >= 0) index = owner
  }
  if (index < 0 || messages[index].role !== 'assistant') return messages
  const next = [...messages]
  next[index] = updater(messages[index])
  return next
}

export function applyAssistantStreamEvent(message, event) {
  const content = [...(message?.content ?? [])]

  if (event?.type === 'replace_assistant_content') {
    const incoming = Array.isArray(event.content) ? event.content : []
    // Preserve the turn-timing footer across content replacements (e.g. the
    // todo-gate correction swaps the assistant content AFTER turn_end already
    // appended the timing block). Timing is a meta-decoration, not part of the
    // reply, so it should survive the swap — matching how replace_assistant_text
    // keeps tool blocks. Without this, per-turn + per-step timing vanishes
    // whenever a correction fires.
    const hasTiming = incoming.some((block) => block.type === 'timing')
    const existingTiming = hasTiming ? null : content.find((block) => block.type === 'timing')
    return {
      ...message,
      content: existingTiming ? [...incoming, existingTiming] : incoming,
    }
  }

  if (event?.type === 'replace_assistant_text') {
    const withoutText = content.filter((block) => block.type !== 'text')
    const nextText = event.content ? [{ type: 'text', text: event.content }] : []
    return { ...message, content: [...withoutText, ...nextText] }
  }

  return message
}
