import { readFile } from "fs/promises";
import * as vscode from "vscode";
import { getExtensionContext } from "../extensionContext";
import { Logger } from "../logger";

const logger = new Logger("references");

/** Get the content of a random markdown file from grug's references. */
export async function getGrugReferenceContent(fileName?: string): Promise<string> {
  const referencesUri: vscode.Uri = vscode.Uri.joinPath(
    getExtensionContext().extensionUri,
    "references",
  );
  const files = await vscode.workspace.fs.readDirectory(referencesUri);

  let fileUri: vscode.Uri;
  if (fileName && files.some((file) => file[0] === fileName)) {
    fileUri = vscode.Uri.joinPath(referencesUri, fileName);
  } else {
    const randomFile = files[Math.floor(Math.random() * files.length)];
    fileUri = vscode.Uri.joinPath(referencesUri, randomFile[0]);
  }

  const fileContent = await readFile(fileUri.fsPath, "utf8");
  return fileContent;
}

/** Parse references from the user's chat message. */
export async function parseReferences(
  references: readonly vscode.ChatPromptReference[],
): Promise<vscode.LanguageModelChatMessage[]> {
  const referenceMessages: vscode.LanguageModelChatMessage[] = [];
  for (const reference of references) {
    logger.debug("grug see reference", { reference });
    const referenceMessage = await handleReference(reference);
    referenceMessages.push(referenceMessage);
  }
  return referenceMessages;
}

async function handleReference(
  reference: vscode.ChatPromptReference,
): Promise<vscode.LanguageModelChatMessage> {
  switch (reference.id) {
    case "vscode.file":
      const fileUri = vscode.Uri.from(reference.value as vscode.Uri);
      const fileContent = await readFile(fileUri.fsPath, "utf8");
      const fileName = fileUri.path.split("/").pop();
      return vscode.LanguageModelChatMessage.User(`${fileName}:\n\n${fileContent}`, "user");
    case "copilot.selection":
      return vscode.LanguageModelChatMessage.User(`${reference.value}`, "user");
    // TODO: handle other reference types
    default:
      return vscode.LanguageModelChatMessage.User(
        `grug not know how to handle reference ${reference.id}`,
        "grug",
      );
  }
}
