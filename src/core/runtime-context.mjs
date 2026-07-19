let activeContext = null;

/**
 * Bridges validated Action options into the legacy module during the
 * strangler migration. The context is process-local, single-run, and cleared
 * immediately after generation so tokens are never persisted.
 */
export function setRuntimeContext(context) {
  if (activeContext) {
    throw new Error("An analytics runtime context is already active.");
  }
  activeContext = Object.freeze({ ...context });
}

export function getRuntimeContext() {
  return activeContext;
}

export function clearRuntimeContext() {
  activeContext = null;
}
