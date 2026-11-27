// SPDX-License-Identifier: AGPL-3.0-or-later
// Docker is simulated; these tests never stop a real service or use user data.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const source = dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(join(tmpdir(), "myech0-updater-test-"));
const fake = String.raw`#!/usr/bin/env node
const fs=require('node:fs'), path=require('node:path');
const args=process.argv.slice(2), text=args.join(' '), base=process.env.TEST_STATE;
const data=path.join(base,'data'), mode=process.env.TEST_MODE;
fs.appendFileSync(path.join(base,'calls'),text+'\n');
if(args[0]==='compose'){
 if(text.includes('config --environment')) console.log('ECH0_DATA_DIR='+data);
 else if(text.includes('config --images')) console.log('example/myech0:latest');
 else if(text.includes('ps -q')) console.log('fixture-container');
 else if(text.includes('pull ') && mode==='pull-fails') process.exit(1);
 else if(text.includes(' up ')){
  if(text.includes('.rollback.yml')){
   if(fs.readFileSync(path.join(data,'database'),'utf8')!=='original') process.exit(2);
   if(fs.existsSync(path.join(data,'new-migration-file'))) process.exit(3);
  }else if(mode==='health-fails'){
   fs.writeFileSync(path.join(data,'database'),'migrated');
   fs.writeFileSync(path.join(data,'new-migration-file'),'new'); process.exit(1);
  }
 }
}else if(args[0]==='inspect'){
 if(text.includes('.Image')) console.log('sha256:old');
 else if(text.includes('.Type')) console.log('bind');
 else if(text.includes('.Source')) console.log(data);
 else console.log('{}');
}else if(args[0]==='image' && args[1]==='inspect'){
 console.log(mode==='unchanged'?'sha256:old':'sha256:new');
}
`;
try {
  for (const mode of ["unchanged", "pull-fails", "success", "health-fails"]) {
    const base = join(root, mode),
      bin = join(base, "bin");
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(join(base, "data"));
    fs.writeFileSync(join(base, "data", "database"), "original");
    fs.writeFileSync(
      join(base, ".env"),
      "ECH0_DATA_DIR=" + join(base, "data") + "\n",
    );
    for (const name of ["update.sh", "compose.yml"])
      fs.copyFileSync(join(source, name), join(base, name));
    fs.writeFileSync(join(bin, "docker"), fake);
    fs.chmodSync(join(bin, "docker"), 0o755);
    const result = spawnSync("sh", [join(base, "update.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        TEST_STATE: base,
        TEST_MODE: mode,
        PATH: bin + ":" + process.env.PATH,
      },
    });
    const calls = fs.readFileSync(join(base, "calls"), "utf8");
    assert.equal(
      result.status,
      ["pull-fails", "health-fails"].includes(mode) ? 1 : 0,
      mode + ": " + result.stdout + result.stderr,
    );
    if (mode === "unchanged" || mode === "pull-fails")
      assert.doesNotMatch(calls, /stop ech0/);
    if (mode === "success" || mode === "health-fails") {
      const backup = join(
        base,
        "backups",
        fs.readdirSync(join(base, "backups"))[0],
      );
      assert.ok(fs.readFileSync(join(backup, "data.tar")).length > 0);
    }
    if (mode === "health-fails") {
      assert.match(calls, /\.rollback\.yml.*up /);
      assert.equal(
        fs.readFileSync(join(base, "data", "database"), "utf8"),
        "original",
      );
      assert.match(
        fs.readFileSync(join(base, "update.failed"), "utf8"),
        /Rollback succeeded/,
      );
      const failed = fs
        .readdirSync(base)
        .find((name) => name.startsWith("data.failed-"));
      assert.equal(
        fs.readFileSync(join(base, failed, "database"), "utf8"),
        "migrated",
      );
    }
    console.log("PASS: " + mode);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
