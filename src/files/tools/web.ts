import express, { Request, Response } from "express";
import fs from "node:fs";

const app = express();
app.get("/", (_req: Request, res: Response) => {
  const files = fs.readdirSync("state").filter(f => f.endsWith(".state.json"));
  const rows = files.map(f => {
    const s = JSON.parse(fs.readFileSync(`state/${f}`, "utf8"));
    return `<tr><td>${s.taskId}</td><td>${s.currentStep}</td><td>${s.phase}</td><td>${s.lastUpdate}</td></tr>`;
  }).join("");
  res.send(`<!doctype html><html><body><h1>Claude tasks</h1><table border="1"><tr><th>Task</th><th>Step</th><th>Phase</th><th>Updated</th></tr>${rows}</table></body></html>`);
});
app.listen(5177, () => console.log("Status web on http://localhost:5177"));