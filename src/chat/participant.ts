import { readFile } from "fs/promises";
import * as vscode from "vscode";
import { getExtensionContext } from "../extensionContext";
import { Logger } from "../logger";
import { BLOG_THOUGHT_SECTIONS } from "./constants";
import { getGrugReferenceContent, parseReferences } from "./references";

const logger = new Logger("handler");

/** Handle an incoming chat message request from the user. */
export async function chatHandler(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
  logger.debug("grug receive chat request", { request, context });

  const messages: vscode.LanguageModelChatMessage[] = [];

  // load initial grug context
  const promptMarkdownUri = vscode.Uri.joinPath(getExtensionContext().extensionUri, "prompt.md");
  const promptText = await readFile(promptMarkdownUri.fsPath, { encoding: "utf8" });
  messages.push(vscode.LanguageModelChatMessage.User(promptText, "grug"));

  // guard against request being empty
  if (
    request.prompt.trim() === "" &&
    (request.references.length === 0 || request.command === undefined)
  ) {
    stream.markdown("grug need more than silence");
    return {};
  }

  // TODO: add history to context

  messages.push(vscode.LanguageModelChatMessage.User(request.prompt, "user"));

  // add any additional references like `#file:<name>`
  if (request.references.length > 0) {
    stream.progress("grug see references");
    const referenceMessages = await parseReferences(request.references);
    logger.debug(`grug add ${referenceMessages.length} reference message(s)`);
    messages.push(...referenceMessages);
  }

  stream.progress("grug think");
  try {
    if (request.command) {
      await handleCommand(request.command, messages, stream, token);
      return { metadata: { command: request.command } };
    } else {
      await handleChatMessage(messages, stream, token);
      return {};
    }
  } catch (error) {
    stream.progress("grug tempted to reach for club, but grug stay calm");
    logger.error("error getting response from language model: ", error);
    stream.markdown("grug hit error. grug log it and hope for better next time.");
    if (error instanceof Error) {
      return { errorDetails: { message: error.message } };
    }
    throw error;
  }
}

/** Handle a command from the user. */
async function handleCommand(
  command: string,
  messages: vscode.LanguageModelChatMessage[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  logger.debug("grug handle command", { command });

  let thoughtReference: string | null = null;
  if (command === "thoughts") {
    // pick a random file from references/*.md
    thoughtReference = await getGrugReferenceContent();
  } else if (BLOG_THOUGHT_SECTIONS.includes(`${command}.md`)) {
    stream.progress(`grug think about ${command}...`);
    thoughtReference = await getGrugReferenceContent(`${command}.md`);
  } else {
    stream.markdown("grug not know how to do that yet.");
  }

  if (thoughtReference) {
    await handleChatMessage(
      [...messages, vscode.LanguageModelChatMessage.User(thoughtReference, "grug")],
      stream,
      token,
    );
  }
}

/** Handle a chat message from the user. */
async function handleChatMessage(
  messages: vscode.LanguageModelChatMessage[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  logger.debug("grug handle chat message", { messages });
  const model: vscode.LanguageModelChat = await getModel();
  const chatResponse: vscode.LanguageModelChatResponse = await model.sendRequest(
    messages,
    {},
    token,
  );
  logger.debug("grug make chat response", { chatResponse });
  for await (const fragment of chatResponse.text) {
    if (token.isCancellationRequested) {
      logger.debug("grug chat request cancelled");
      return;
    }
    stream.markdown(fragment);
  }
}

/** Get the language model to use for the chat; adjusted by user settings. */
async function getModel(): Promise<vscode.LanguageModelChat> {
  const configModelFamily: string = vscode.workspace
    .getConfiguration("grug")
    .get("languageModel", "gpt-4o");

  const modelSelector: vscode.LanguageModelChatSelector = {
    vendor: "copilot",
    family: configModelFamily,
  };
  const [model] = await vscode.lm.selectChatModels(modelSelector);
  if (!model) {
    throw new Error(`no language model found for ${JSON.stringify(modelSelector)}`);
  }

  logger.info(`using language model: ${JSON.stringify(model)}`);
  return model;
}
