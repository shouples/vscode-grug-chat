import { ExtensionContext } from "vscode";

let context: ExtensionContext;
export function setExtensionContext(extContext: ExtensionContext) {
  context = extContext;
}

export function getExtensionContext() {
  if (!context) {
    throw new Error("Extension context not set");
  }
  return context;
}
