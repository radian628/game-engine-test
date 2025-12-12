type Task<T> = () => Promise<T>;

export async function scheduleAndCompleteAsynchronousTaskGraph<Tag, T>(
  tasks: { task: () => Promise<T>; tags: Tag[]; waitFor: Tag[] }[]
): Promise<T[]> {
  const tasksByTag = new Map<Tag, Set<(typeof tasks)[number]>>();

  const started = new Map<(typeof tasks)[number], Promise<T>>();

  for (const t of tasks) {
    for (const tag of t.tags) {
      tasksByTag.set(tag, (tasksByTag.get(tag) ?? new Set()).add(t));
    }
  }

  function runTaskIfNotStarted(t: (typeof tasks)[number]) {
    if (started.has(t)) return started.get(t);
    const taskWithDependencies = (async () => {
      let waitUntilTheseDone: Promise<any>[] = [];
      for (const tagToWaitFor of t.waitFor) {
        for (const taskToWaitFor of tasksByTag.get(tagToWaitFor) ?? new Set()) {
          waitUntilTheseDone.push(runTaskIfNotStarted(taskToWaitFor));
        }
      }
      await Promise.all(waitUntilTheseDone);
      return await t.task();
    })();
    started.set(t, taskWithDependencies);
    return taskWithDependencies;
  }

  for (const t of tasks) {
    runTaskIfNotStarted(t);
  }

  return await Promise.all([...started.values()]);
}

export function scheduleAndCompleteSynchronousTaskGraph<Tag, T>(
  tasks: { task: () => T; tags: Tag[]; waitFor: Tag[] }[]
): T[] {
  const tasksByTag = new Map<Tag, Set<(typeof tasks)[number]>>();

  const started = new Map<(typeof tasks)[number], T>();

  for (const t of tasks) {
    for (const tag of t.tags) {
      tasksByTag.set(tag, (tasksByTag.get(tag) ?? new Set()).add(t));
    }
  }

  function runTaskIfNotStarted(t: (typeof tasks)[number]) {
    if (started.has(t)) return started.get(t);
    const taskWithDependencies = (() => {
      let waitUntilTheseDone: any[] = [];
      for (const tagToWaitFor of t.waitFor) {
        for (const taskToWaitFor of tasksByTag.get(tagToWaitFor) ?? new Set()) {
          waitUntilTheseDone.push(runTaskIfNotStarted(taskToWaitFor));
        }
      }
      return t.task();
    })();
    started.set(t, taskWithDependencies);
    return taskWithDependencies;
  }

  for (const t of tasks) {
    runTaskIfNotStarted(t);
  }

  return [...started.values()];
}
