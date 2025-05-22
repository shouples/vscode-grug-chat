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

  // Prepare model and tool definitions outside the try/catch and handleChatMessage
  let model: vscode.LanguageModelChat;
  let grugToolDefinitions: vscode.LanguageModelChatTool[];

  try {
    model = await getModel();

    const allRegisteredTools: readonly vscode.LanguageModelToolInformation[] = vscode.lm.tools;
    logger.debug(`Found ${allRegisteredTools.length} registered tools total.`);
    const grugToolNames = ['grug_get_random_thought', 'grug_get_specific_thought'];
    const relevantRegisteredTools = allRegisteredTools.filter(tool => grugToolNames.includes(tool.name));
    logger.debug(`Found ${relevantRegisteredTools.length} relevant Grug tools.`);

    grugToolDefinitions = relevantRegisteredTools.map(toolInfo => ({
      name: toolInfo.name,
      description: toolInfo.description || `Grug's tool: ${toolInfo.name}`,
      inputSchema: toolInfo.inputSchema
    }));

    if (grugToolDefinitions.length > 0) {
      logger.debug("Passing the following Grug tools to the model:", grugToolDefinitions.map(t => t.name));
    } else {
      logger.warn("No Grug tools found to pass to the model. Check registration and names.");
    }

    // Call the refactored handleChatMessage
    await handleChatMessage(request, messages, stream, token, model, grugToolDefinitions);
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

/** Handle a chat message from the user, managing iterative tool calls and responses. */
async function handleChatMessage(
  request: vscode.ChatRequest, // Added request for toolInvocationToken
  initialMessages: vscode.LanguageModelChatMessage[],
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  model: vscode.LanguageModelChat, // Pass model in
  grugToolDefinitions: vscode.LanguageModelChatTool[] // Pass definitions in
): Promise<void> {
  logger.debug("Grug starting iterative chat message handling", { initialMessagesCount: initialMessages.length });

  const messagesForNextRequest = [...initialMessages];

  while (true) {
    if (token.isCancellationRequested) {
      logger.debug("Grug chat cancelled before new LLM request.");
      stream.markdown("Grug stop thinking, request cancelled.");
      return;
    }

    logger.debug(`Sending ${messagesForNextRequest.length} messages to LLM for next turn.`);
    const chatResponse = await model.sendRequest(
      messagesForNextRequest,
      { tools: grugToolDefinitions },
      token,
    );

    let hasMadeToolCallInThisIteration = false;
    const assistantResponseMessageParts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];
    const toolResultsForNextTurn: vscode.LanguageModelToolResultPart[] = [];
    let currentTextChunk = "";

    for await (const chunk of chatResponse.text) {
      if (token.isCancellationRequested) {
        logger.debug("Grug chat request cancelled during response processing");
        stream.markdown("\n\nGrug stop, request cancelled while Grug talk.");
        // Do not add partial assistant message to history if cancelled mid-stream
        return;
      }

      if (typeof chunk === 'string') {
        stream.markdown(chunk);
        currentTextChunk += chunk;
      } else if (chunk instanceof vscode.LanguageModelToolCallPart) {
        if (currentTextChunk) {
          assistantResponseMessageParts.push(new vscode.LanguageModelTextPart(currentTextChunk));
          currentTextChunk = "";
        }
        assistantResponseMessageParts.push(chunk);
        hasMadeToolCallInThisIteration = true;

        logger.info(`LLM requests tool call: ${chunk.name}`, chunk.parameters);
        stream.progress(`Grug use tool: ${chunk.name}...`);

        try {
          const toolResult = await vscode.lm.invokeTool(
            chunk.name,
            { input: chunk.parameters, toolInvocationToken: request.toolInvocationToken },
            token
          );
          
          // Assuming toolResult.content is already Array<LanguageModelTextPart | LanguageModelPromptPart>
          // which aligns with LanguageModelToolResult.content type.
          toolResultsForNextTurn.push(new vscode.LanguageModelToolResultPart(chunk.callId, toolResult.content));
          logger.info(`Tool ${chunk.name} executed successfully.`);
          stream.progress(`Tool ${chunk.name} finished.`);
        } catch (toolError: any) {
          logger.error(`Error invoking tool ${chunk.name}:`, toolError);
          const errorMessage = toolError.message || 'Unknown error during tool execution';
          stream.markdown(`\n\nGrug error using tool ${chunk.name}: ${errorMessage}\n\n`);
          
          const errorResultContent: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [new vscode.LanguageModelTextPart(`Error executing tool ${chunk.name}: ${errorMessage}`)];
          toolResultsForNextTurn.push(new vscode.LanguageModelToolResultPart(chunk.callId, errorResultContent));
        }
      }
    }

    // After iterating all chunks from chatResponse.text:
    if (currentTextChunk) { // Add any trailing text from assistant
      assistantResponseMessageParts.push(new vscode.LanguageModelTextPart(currentTextChunk));
    }

    // Add the assistant's complete message (text and/or tool calls) to history for the next LLM turn
    if (assistantResponseMessageParts.length > 0) {
      messagesForNextRequest.push(new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.Assistant,
        assistantResponseMessageParts
      ));
      logger.debug("Added Assistant message to history for next turn.", { partCount: assistantResponseMessageParts.length });
    }

    // If tool calls were made and their results processed, add these results to history
    if (toolResultsForNextTurn.length > 0) {
      messagesForNextRequest.push(new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User, // Per API, tool results are User role
        toolResultsForNextTurn
      ));
      logger.debug("Added Tool results to history for next turn.", { resultCount: toolResultsForNextTurn.length });
    }
    
    // If no tool calls were made in this iteration, the conversation turn is complete.
    if (!hasMadeToolCallInThisIteration) {
      logger.debug("No tool calls in this iteration, ending Grug's turn.");
      break; 
    }
    logger.debug("Tool calls made, continuing interaction loop.");
  }
  logger.debug("Grug finished handling chat message.");
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
      // Grug's previous responses should be Assistant role
      let grugSaidContent = "";
      for (const part of turn.response) { // turn.response is readonly ChatResponsePart[]
        if (part instanceof vscode.ChatResponseMarkdownPart) {
          grugSaidContent += part.value;
        }
        // Potentially handle other ChatResponsePart types if they become relevant for history
      }
      if (grugSaidContent.trim() !== "") {
        messages.push(
          new vscode.LanguageModelChatMessage(
            vscode.LanguageModelChatMessageRole.Assistant,
            grugSaidContent, // Use the raw accumulated markdown content
            "grug" // Optional name
          )
        );
      }
    }
  }

  // TODO: implement a user-configurable limit on the number of history messages to show

  return messages;
}
