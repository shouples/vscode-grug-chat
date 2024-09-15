import * as vscode from "vscode";
import { Logger } from "../logger";

const logger = new Logger("followups");

export function provideFollowups(
  result: vscode.ChatResult,
  context: vscode.ChatContext,
  token: vscode.CancellationToken,
): vscode.ProviderResult<vscode.ChatFollowup[]> {
  logger.debug("grug receive followup request", { result, context });

  // TODO: implement this based on `metadata` from the result above

  return [];
}
