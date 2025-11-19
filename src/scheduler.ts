type Task<T> = () => Promise<T>;

export async function scheduleAndCompleteAsynchronousTaskGraph<Tag, T>(
  tasks: { task: () => Promise<T>; tags: Tag[]; waitFor: Tag[] }[]
): Promise<T[]> {
  const tasksByTag = new Map<Tag, Set<(typeof tasks)[number]>>();

  const started = new Map<(typeof tasks)[number], Promise<T>>();

  for (const t of tasks) {
    for (const tag of t.tags) {
      tasksByTag.set(tag, tasksByTag.get(tag).add(t) ?? new Set());
    }
  }

  function runTaskIfNotStarted(t: (typeof tasks)[number]) {
    if (started.has(t)) return;
    const taskWithDependencies = (async () => {
      let waitUntilTheseDone: Promise<any>[] = [];
      for (const tagToWaitFor of t.waitFor) {
        for (const taskToWaitFor of tasksByTag.get(tagToWaitFor) ?? new Set()) {
          waitUntilTheseDone.push(runTaskIfNotStarted(t));
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
