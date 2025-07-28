import blessed from "blessed";
import fs from "node:fs";

const screen = blessed.screen({ smartCSR: true });
const box = blessed.box({ top: 0, left: 0, width: "100%", height: "100%", border: "line", label: " Claude task status " });
screen.append(box);
function render() {
  const s = fs.existsSync("state/current.state.json") ? JSON.parse(fs.readFileSync("state/current.state.json", "utf8")) : null;
  if (!s) { box.setContent("No status yet"); screen.render(); return; }
  const steps = Object.entries(s.steps || {}).map(([k,v]) => `- ${k}: ${v}`).join("\n");
  box.setContent([`Current: ${s.currentStep} (${s.phase})`, steps, `Updated: ${s.lastUpdate}`].join("\n"));
  screen.render();
}
setInterval(render, 1000);
screen.key(["q","C-c"], () => process.exit(0));
render();