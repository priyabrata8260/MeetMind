import fs from 'fs/promises';
import path from 'path';
import { WorkspaceState } from '../src/types';
import { createInitialSeedState } from './seed';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'workspace.json');

let cachedState: WorkspaceState | null = null;
let writeChain: Promise<void> = Promise.resolve();

export async function loadState(): Promise<WorkspaceState> {
  if (cachedState) return cachedState;

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STORE_PATH, 'utf-8');
    cachedState = JSON.parse(raw) as WorkspaceState;
    return cachedState;
  } catch {
    const initial = createInitialSeedState();
    cachedState = initial;
    await persistState(initial);
    return initial;
  }
}

export async function persistState(state: WorkspaceState): Promise<void> {
  cachedState = state;
  writeChain = writeChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpPath = `${STORE_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    await fs.rename(tmpPath, STORE_PATH);
  });
  await writeChain;
}

export async function mutateState<T>(
  mutator: (state: WorkspaceState) => Promise<T> | T
): Promise<{ state: WorkspaceState; result: T }> {
  const state = await loadState();
  const result = await mutator(state);
  await persistState(state);
  return { state, result };
}

export async function resetSeedState(): Promise<WorkspaceState> {
  const fresh = createInitialSeedState();
  await persistState(fresh);
  return fresh;
}
