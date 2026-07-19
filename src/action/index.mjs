import { runAction } from "./main.mjs";

runAction().catch((error) => {
  // runAction owns normal failure reporting; this boundary covers only an
  // unexpected adapter rejection before core.setFailed can run.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
