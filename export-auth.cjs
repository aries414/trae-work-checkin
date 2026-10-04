"use strict";
/**
 * 安全导出 Trae auth JSON 到本地文件（不打印到终端，避免泄露）。
 * 运行后打开 export/auth.json 复制全部内容即可。
 */
const fs = require("fs");
const path = require("path");
const { loadAuth } = require("./lib.cjs");

const auth = loadAuth();
const out = path.join(__dirname, "export", "auth.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(auth));

const size = fs.statSync(out).size;
console.log(`Auth exported to: ${out}`);
console.log(`File size: ${size} bytes`);
console.log("\n>>> Open this file in a text editor, copy ALL content,");
console.log(">>> and paste into GitHub Repo -> Settings -> Secrets -> Actions -> New repository secret");
console.log(">>> Name: TRAE_AUTH_JSON");
