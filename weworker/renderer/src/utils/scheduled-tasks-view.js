export function scheduledTasksPageState(section, activeTaskId, tasksStatus) {
  if (section !== 'tasks') return 'none'
  if (activeTaskId) return 'task'
  if (tasksStatus === 'error') return 'error'
  if (tasksStatus !== 'ready') return 'loading'
  return 'empty'
}
