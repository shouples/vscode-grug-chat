import { readFile } from "fs/promises";
import * as vscode from "vscode";
import { getExtensionContext } from "../extensionContext";
import { Logger } from "../logger";
import { CHAT_PARTICIPANT_ID } from "./constants"; // Removed BLOG_THOUGHT_SECTIONS
import { parseReferences } from "./references"; // Removed getGrugReferenceContent

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
  const promptMarkdownUri = vscode.Uri.joinPath(
    getExtensionContext().extensionUri,
    "references/prompt.md",
  );
  const promptText = await readFile(promptMarkdownUri.fsPath, { encoding: "utf8" });
  messages.push(vscode.LanguageModelChatMessage.User(promptText, "grug"));

  const userPrompt = request.prompt.trim();
  // guard against request being empty
  if (userPrompt === "" && request.references.length === 0 && request.command === undefined) {
    stream.markdown("grug need more than silence");
    return {};
  }

  const historyMessages = filterContextHistory(context.history);
  messages.push(...historyMessages);

  // add the user's prompt to the messages, if they provided one
  if (userPrompt) {
    messages.push(vscode.LanguageModelChatMessage.User(request.prompt, "user"));
  } else {
    messages.push(vscode.LanguageModelChatMessage.User("grug give developer advice", "grug"));
  }

  // add any additional references like `#file:<name>`
  if (request.references.length > 0) {
    stream.progress("grug see references");
    const referenceMessages = await parseReferences(request.references);
    logger.debug(`grug add ${referenceMessages.length} reference message(s)`);
    messages.push(...referenceMessages);
  }

  stream.progress("grug think");
  try {
    // Old command handling removed, tools will be invoked by the LM system
    await handleChatMessage(messages, stream, token);
    return {};
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

// Removed handleChatCommand function

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

/** Filter the chat history to only relevant messages for the current chat with Grug. */
function filterContextHistory(
  history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[],
): vscode.LanguageModelChatMessage[] {
  // only use messages where Grug was tagged, or messages where Grug responded
  const filteredHistory = history.filter((msg) => msg.participant === CHAT_PARTICIPANT_ID);
  if (filteredHistory.length === 0) {
    return [];
  }

  const messages: vscode.LanguageModelChatMessage[] = [];
  for (const turn of filteredHistory) {
    logger.debug("grug add history message", { turn });
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push(
        vscode.LanguageModelChatMessage.User(
          `user said:\n\`\`\`markdown\n${turn.prompt}\n\`\`\``,
          "user",
        ),
      );
      // TODO: add previous commands/references?
    } else if (turn instanceof vscode.ChatResponseTurn) {
      if (turn.response instanceof vscode.ChatResponseMarkdownPart) {
        messages.push(
          vscode.LanguageModelChatMessage.User(
            `grug said:\n\`\`\`markdown\n${turn.response.value}\n\`\`\``,
            "grug",
          ),
        );
      }
    }
  }

  // TODO: implement a user-configurable limit on the number of history messages to show

  return messages;
}
