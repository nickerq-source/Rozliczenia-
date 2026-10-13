/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS hook for application TS modules. */
const fs = require("node:fs");
const ts = require("typescript");

// Run application modules with extensionless imports without a second TS build.
require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
