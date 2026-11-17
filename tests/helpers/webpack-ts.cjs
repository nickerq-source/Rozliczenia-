/* eslint-disable @typescript-eslint/no-require-imports -- Loader for the isolated browser test bundle. */
const ts = require("typescript");
module.exports = function transform(source) {
  return ts.transpileModule(source, { fileName: this.resourcePath, compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  } }).outputText;
};
