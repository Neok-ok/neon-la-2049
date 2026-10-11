// Serialise worker jobs that must wait for a dynamic import, without blocking jobs that are already ready.

export function createJobQueue<T>(ready: (job: T) => boolean, run: (job: T) => void, until: Promise<void>): (job: T) => void {
  const queue: T[] = [];
  let pumping = false;

  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      while (queue.length) {
        let idx = queue.findIndex(ready);
        if (idx < 0) {
          await until;
          idx = 0;
        }
        const job = queue.splice(idx, 1)[0];
        if (job) run(job);
      }
    } finally {
      pumping = false;
      if (queue.length) void pump();
    }
  }

  return (job: T) => {
    queue.push(job);
    void pump();
  };
}
