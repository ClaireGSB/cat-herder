import fs from "node:fs";

function readState() {
  const files = fs.readdirSync("state").filter(f => f.endsWith(".state.json"));
  if (!files.length) return null;
  const p = `state/${files[0]}`;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const input = await new Promise<string>((res) => { let buf = ""; process.stdin.on("data", d => buf += d); process.stdin.on("end", () => res(buf)); });
const payload = JSON.parse(input || "{}");
const pathEdited: string | undefined = payload?.tool_input?.file_path;
const state = readState();

function block(msg: string) { process.stderr.write(msg + "\n"); process.exit(2); }

if (state && pathEdited) {
  const testsDone = state.steps?.write_tests === "done";
  const implDone = state.steps?.implement === "done";
  if (pathEdited.startsWith("src/") && !testsDone) block("Blocked: write tests before editing src/");
  if ((pathEdited.endsWith("README.md") || pathEdited.startsWith("docs/")) && !implDone) block("Blocked: update docs after implementation");
}