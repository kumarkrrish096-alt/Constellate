import { spawn } from "child_process";

const children = [
  spawn(process.execPath, ["server.js"], { stdio: "inherit" }),
  spawn(process.execPath, ["worker.js"], { stdio: "inherit" }),
];

let stopping = false;
let exited = 0;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }

  const forceTimer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 25_000);
  forceTimer.unref();
}

for (const child of children) {
  child.on("error", (error) => {
    console.error("Could not start API or worker:", error);
    process.exitCode = 1;
    stop("SIGTERM");
  });

  child.on("exit", (code) => {
    exited++;
    if (!stopping) {
      process.exitCode = code || 1;
      stop("SIGTERM");
    }
    if (exited === children.length && !process.exitCode) process.exitCode = code || 0;
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));