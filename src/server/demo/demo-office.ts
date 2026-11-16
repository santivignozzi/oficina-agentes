import { ManagedOffice } from '../engine/managed-office'
import { MemoryRepository } from '../engine/memory-repository'
import { ScriptedRunner } from './scripted-runner'
import { seedDemo } from './seed'

export function createDemoOffice() {
  return new ManagedOffice({
    profile: { mode: 'demo', simulated: true, controllable: true, billing: () => null },
    repo: new MemoryRepository(),
    runner: new ScriptedRunner(),
    seed: seedDemo,
  })
}
