import * as fs from "fs";
import * as path from "path";
import { ChatVariableLevel, Disposable, chat } from "vscode";
import { getExtensionContext } from "../extensionContext";
import { Logger } from "../logger";

const logger = new Logger("chat.variables");

export function registerChatVariableResolvers(): Disposable[] {
  const resolvers: Disposable[] = [];

  const extensionContext = getExtensionContext();

  const referencesDir = path.join(extensionContext.extensionPath, "references");
  const files = fs.readdirSync(referencesDir);
  files.forEach((file) => {
    if (file.endsWith(".md")) {
      const filePath = path.join(referencesDir, file);
      const fileName = path.basename(file, ".md");
      const fileContents = fs.readFileSync(filePath, "utf-8");

      const resolver: Disposable = chat.registerChatVariableResolver(
        `grug-chat-${fileName}`,
        fileName,
        `The ${fileName} reference`,
        `The ${fileName} reference`,
        true,
        {
          resolve: () => {
            // TODO: implement lower-level variable values?
            return [
              {
                level: ChatVariableLevel.Full,
                value: fileContents,
              },
            ];
          },
        },
      );
      resolvers.push(resolver);
    }
  });

  return resolvers;
}
