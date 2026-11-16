// `next start` espera a que terminen las conexiones antes de salir, y un stream nunca
// termina solo: con una pestaña abierta, el proceso viejo seguiría vivo después de un
// deploy y podría pisar los datos del nuevo. El global es por lo mismo que en `runtime.ts`.
const holder = globalThis as typeof globalThis & { aiOfficeShutdown?: Set<() => void> }

export function onShutdown(task: () => void) {
  if (!holder.aiOfficeShutdown) {
    const tasks = new Set<() => void>()
    const runAll = () => tasks.forEach(run => run())
    process.once('SIGTERM', runAll)
    process.once('SIGINT', runAll)
    holder.aiOfficeShutdown = tasks
  }
  const tasks = holder.aiOfficeShutdown
  tasks.add(task)
  return () => {
    tasks.delete(task)
  }
}
