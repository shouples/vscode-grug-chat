import { chat, ChatParticipant, Disposable, ExtensionContext, Uri } from "vscode";
import { CHAT_PARTICIPANT_ID } from "./chat/constants";
import { provideFollowups } from "./chat/followups";
import { chatHandler } from "./chat/participant";
import { registerChatVariableResolvers } from "./chat/variables";
import { setExtensionContext } from "./extensionContext";
import { Logger, OUTPUT_CHANNEL } from "./logger";

const logger = new Logger("extension");

export function activate(context: ExtensionContext) {
  setExtensionContext(context);

  // register the output channel
  context.subscriptions.push(OUTPUT_CHANNEL);

  // register the chat participant
  const grug: ChatParticipant = chat.createChatParticipant(CHAT_PARTICIPANT_ID, chatHandler);
  grug.followupProvider = { provideFollowups };
  grug.iconPath = Uri.joinPath(context.extensionUri, "resources/grug.png");
  context.subscriptions.push(grug);

  const variables: Disposable[] = registerChatVariableResolvers();
  context.subscriptions.push(...variables);

  logger.info("vscode-grug activated, everything good!");
}

export function deactivate() {
  logger.info("vscode-grug deactivated, sad but true.");
}
