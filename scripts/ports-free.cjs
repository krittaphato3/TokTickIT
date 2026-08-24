// Frees the shared dev ports (4000 API, 5173 UI) by killing whatever
// process is listening on them — npm's node.exe children keep running as
// orphans on Windows after their terminal window closes, which blocks
// `docker compose up` (and vice versa). Run from the repo root:
//
//   npm run ports:free
//
// Only processes bound to these two local ports are touched; anything else
// is left alone. Exits non-zero if a port stays busy after being killed.
//
// Port state comes from `netstat -ano` rather than a test-bind: on Windows,
// Node enables SO_REUSEADDR by default, so binding "succeeds" even when a
// listener already owns the port — a bind probe cannot detect squatters.
const { execSync } = require('node:child_process');

const PORTS = [4000, 5173];
const KILL_GRACE_MS = 3000;

// Returns the PID listening on `port`, or null if none.
function findListenerPid(port) {
  let out;
  try {
    out = execSync('netstat -ano', { encoding: 'utf8' });
  } catch {
    return null;
  }
  for (const line of out.split('\n')) {
    // LISTENING lines look like:
    //   TCP    0.0.0.0:4000  0.0.0.0:0  LISTENING  12345
    if (!/LISTENING/.test(line)) continue;
    const m = line.match(/(?:[\w.]*):(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
    if (m && Number(m[1]) === port && Number(m[2]) !== 0) return Number(m[2]);
  }
  return null;
}

function killPid(pid) {
  // /T kills the child tree too (npm -> node orphans).
  execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let failed = false;

  for (const port of PORTS) {
    let pid = findListenerPid(port);
    if (!pid) {
      console.log(`port ${port}: free`);
      continue;
    }
    try {
      killPid(pid);
    } catch {
      console.log(`port ${port}: could not kill PID ${pid} (access denied?)`);
      failed = true;
      continue;
    }
    // Wait for the OS to actually release the socket.
    let released = false;
    for (let waited = 0; waited < KILL_GRACE_MS; waited += 250) {
      await sleep(250);
      if (!findListenerPid(port)) {
        released = true;
        break;
      }
    }
    if (released) {
      console.log(`port ${port}: killed process ${pid}`);
    } else {
      console.log(`port ${port}: PID ${pid} killed but still listening`);
      failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
}

main();
