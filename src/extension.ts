import * as vscode from "vscode";
import { CHAT_PARTICIPANT_ID } from "./chat/constants";
import { provideFollowups } from "./chat/followups";
import { chatHandler } from "./chat/participant";
import { GetRandomThoughtTool, GetSpecificThoughtTool } from "./chat/tools"; // Added import
import { setExtensionContext } from "./extensionContext";
import { Logger, OUTPUT_CHANNEL } from "./logger";

const logger = new Logger("extension");

export function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);

  // register the output channel
  context.subscriptions.push(OUTPUT_CHANNEL);

  // Register the language model tools
  context.subscriptions.push(vscode.lm.registerTool('grug_get_random_thought', new GetRandomThoughtTool()));
  context.subscriptions.push(vscode.lm.registerTool('grug_get_specific_thought', new GetSpecificThoughtTool()));

  // register the chat participant
  const grug: vscode.ChatParticipant = vscode.chat.createChatParticipant(
    CHAT_PARTICIPANT_ID,
    chatHandler,
  );
  grug.followupProvider = { provideFollowups };
  grug.iconPath = vscode.Uri.joinPath(context.extensionUri, "resources/grug.png");
  context.subscriptions.push(grug);

  logger.info("vscode-grug activated, everything good!");
}

export function deactivate() {
  logger.info("vscode-grug deactivated, sad but true.");
}
