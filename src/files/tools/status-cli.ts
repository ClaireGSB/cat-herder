import fs from "node:fs";
const s = fs.existsSync("state/current.state.json") ? JSON.parse(fs.readFileSync("state/current.state.json", "utf8")) : null;
console.log(JSON.stringify(s, null, 2));