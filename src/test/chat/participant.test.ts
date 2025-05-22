import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'fs/promises'; // For mocking readFile
import { chatHandler } from '../../chat/participant';
import * as extensionContext from '../../extensionContext';
import * as loggerModule from '../../logger'; // To mock the Logger class

// Helper to create a mock chat response stream
function createMockChatResponse(parts: (string | vscode.LanguageModelToolCallPart)[]) {
    return {
        text: (async function* () {
            for (const part of parts) {
                // Simulate a small delay, similar to real streaming
                // await new Promise(resolve => setTimeout(resolve, 5));
                yield part;
            }
        })()
    };
}

const mockGrugToolInfo: vscode.LanguageModelToolInformation[] = [
    { 
        name: 'grug_get_random_thought', 
        description: 'Retrieves a random thought or piece of wisdom from Grug.',
        inputSchema: { type: 'object', properties: {} }
    },
    { 
        name: 'grug_get_specific_thought', 
        description: 'Retrieves Grug\'s thoughts on a specific topic.',
        inputSchema: { 
            type: 'object', 
            properties: { 
                topic: { type: 'string', description: 'The topic.' }
            },
            required: ['topic']
        }
    }
];

const mockGrugChatTools: vscode.LanguageModelChatTool[] = mockGrugToolInfo.map(info => ({
    name: info.name,
    description: info.description!, // Assuming description is always present based on package.json
    inputSchema: info.inputSchema
}));


suite('chatHandler and handleChatMessage Integration Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let mockLanguageModel: sinon.SinonStubbedInstance<vscode.LanguageModelChat>;
    let mockStream: {
        markdown: sinon.SinonSpy<[string | vscode.MarkdownString], void | Thenable<void>>,
        progress: sinon.SinonSpy<[string], void | Thenable<void>>,
        // Add other methods if they are called by the participant
    };
    let selectChatModelsStub: sinon.SinonStub;
    let invokeToolStub: sinon.SinonStub;
    let toolsStub: sinon.SinonStub; // For vscode.lm.tools
    let readFileStub: sinon.SinonStub;
    let mockExtensionCtx: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();

        // Mock Logger
        sandbox.stub(loggerModule, 'Logger').returns({
            info: sandbox.stub(),
            debug: sandbox.stub(),
            error: sandbox.stub(),
            warn: sandbox.stub(),
        } as any);
        
        // Mock getExtensionContext
        mockExtensionCtx = {
            extensionUri: vscode.Uri.file('/mock/extension/path'),
            subscriptions: [],
            workspaceState: { get: sandbox.stub(), update: sandbox.stub() } as any,
            globalState: { get: sandbox.stub(), update: sandbox.stub(), setKeysForSync: sandbox.stub() } as any,
            secrets: { get: sandbox.stub(), store: sandbox.stub(), delete: sandbox.stub(), onDidChange: sandbox.stub() } as any,
            extensionPath: '/mock/extension/path',
            environmentVariableCollection: {} as any,
            extensionMode: vscode.ExtensionMode.Test,
            storageUri: vscode.Uri.file('/mock/storage/uri'),
            globalStorageUri: vscode.Uri.file('/mock/globalstorage/uri'),
            logUri: vscode.Uri.file('/mock/log/uri'),
            asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
        };
        sandbox.stub(extensionContext, 'getExtensionContext').returns(mockExtensionCtx);

        // Mock vscode.lm.tools
        // @ts-ignore - getter mocking
        toolsStub = sandbox.stub(vscode.lm, 'tools').get(() => mockGrugToolInfo);


        // Mock LanguageModelChat
        mockLanguageModel = {
            sendRequest: sandbox.stub(),
            // Add any other methods if used, though sendRequest is primary
        } as sinon.SinonStubbedInstance<vscode.LanguageModelChat>;

        // Mock vscode.lm.selectChatModels
        selectChatModelsStub = sandbox.stub(vscode.lm, 'selectChatModels').resolves([mockLanguageModel]);

        // Mock vscode.lm.invokeTool
        invokeToolStub = sandbox.stub(vscode.lm, 'invokeTool');

        // Mock ChatResponseStream
        mockStream = {
            markdown: sandbox.spy(),
            progress: sandbox.spy(),
            // response: sandbox.spy(), // if used
        };

        // Mock file system for prompt.md
        readFileStub = sandbox.stub(fs, 'readFile').resolves("Grug's initial wisdom about rocks.");
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Scenario: Simple Text Response (No Tool Call)', async () => {
        const userPrompt = "Tell me about big rock.";
        mockLanguageModel.sendRequest.resolves(createMockChatResponse(["Big rock is heavy. Grug like heavy rock."]));

        const request: vscode.ChatRequest = {
            prompt: userPrompt,
            command: undefined,
            references: [],
            toolInvocationToken: { value: 'test-token', isCancellationRequested: false, onCancellationRequested: sandbox.stub() } as any,
            participant: 'Grug',
            location: vscode.ChatLocation.Panel
        };
        const context: vscode.ChatContext = { history: [] };
        const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: sandbox.stub() };

        await chatHandler(request, context, mockStream as any, token);

        assert.ok(mockStream.markdown.calledWith("Big rock is heavy. Grug like heavy rock."), 'Markdown should be called with the LLM text response');
        assert.ok(invokeToolStub.notCalled, 'invokeTool should NOT be called');
        
        const firstCallArgs = mockLanguageModel.sendRequest.getCall(0).args;
        const messagesToLLM = firstCallArgs[0] as vscode.LanguageModelChatMessage[];
        assert.strictEqual(messagesToLLM.length, 2, "Should have 2 messages: initial prompt + user prompt");
        assert.strictEqual(messagesToLLM[0].content, "Grug's initial wisdom about rocks.");
        assert.strictEqual(messagesToLLM[0].role, vscode.LanguageModelChatMessageRole.User); // Initial prompt is User role with Grug's name
        assert.strictEqual(messagesToLLM[0].name, "grug");
        assert.strictEqual(messagesToLLM[1].content, userPrompt);
        assert.strictEqual(messagesToLLM[1].role, vscode.LanguageModelChatMessageRole.User);
        assert.strictEqual(messagesToLLM[1].name, "user");

        const optionsToLLM = firstCallArgs[1] as vscode.LanguageModelChatRequestOptions;
        assert.deepStrictEqual(optionsToLLM.tools, mockGrugChatTools, "Tool definitions should be passed to sendRequest");
    });

    test('Scenario: Single Tool Call, Success, then Text Response', async () => {
        const userPrompt = "What Grug think of testing?";
        const toolCallId = "tool_call_123";
        const toolParams = { topic: "testing" };
        const toolResultContent = "Grug says testing is important!";

        mockLanguageModel.sendRequest.onFirstCall().resolves(createMockChatResponse([
            new vscode.LanguageModelToolCallPart(toolCallId, 'grug_get_specific_thought', toolParams)
        ]));
        invokeToolStub.withArgs('grug_get_specific_thought', sinon.match({ input: toolParams })).resolves({
            content: [new vscode.LanguageModelTextPart(toolResultContent)]
        });
        mockLanguageModel.sendRequest.onSecondCall().resolves(createMockChatResponse([
            "Okay, Grug has shared thoughts on testing."
        ]));

        const request: vscode.ChatRequest = {
            prompt: userPrompt, command: undefined, references: [],
            toolInvocationToken: { value: 'test-token-tool', isCancellationRequested: false, onCancellationRequested: sandbox.stub() } as any,
            participant: 'Grug', location: vscode.ChatLocation.Panel
        };
        const context: vscode.ChatContext = { history: [] };
        const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: sandbox.stub() };

        await chatHandler(request, context, mockStream as any, token);

        assert.ok(mockStream.progress.calledWith('Grug use tool: grug_get_specific_thought...'), 'Progress should show tool invocation start');
        assert.ok(mockStream.progress.calledWith('Tool grug_get_specific_thought finished.'), 'Progress should show tool invocation end');
        assert.ok(mockStream.markdown.calledWith("Okay, Grug has shared thoughts on testing."), 'Markdown should be called with the final LLM text response');
        
        assert.ok(invokeToolStub.calledOnceWith('grug_get_specific_thought', sinon.match({ input: toolParams })), 'invokeTool should be called once with correct args');

        // Verify messages for the first LLM call (prompting the tool call)
        const firstLLMCallArgs = mockLanguageModel.sendRequest.getCall(0).args;
        const firstMessagesToLLM = firstLLMCallArgs[0] as vscode.LanguageModelChatMessage[];
        assert.strictEqual(firstMessagesToLLM.length, 2, "First LLM call: initial prompt + user prompt");
        assert.strictEqual(firstMessagesToLLM[1].content, userPrompt);

        // Verify messages for the second LLM call (after tool result)
        const secondLLMCallArgs = mockLanguageModel.sendRequest.getCall(1).args;
        const secondMessagesToLLM = secondLLMCallArgs[0] as vscode.LanguageModelChatMessage[];
        assert.strictEqual(secondMessagesToLLM.length, 2 + 2, "Second LLM call: initial + user + assistant_tool_call + user_tool_result");

        const assistantMessage = secondMessagesToLLM[2];
        assert.strictEqual(assistantMessage.role, vscode.LanguageModelChatMessageRole.Assistant);
        assert.strictEqual(assistantMessage.content.length, 1);
        const assistantToolCallPart = assistantMessage.content[0] as vscode.LanguageModelToolCallPart;
        assert.deepStrictEqual(assistantToolCallPart.parameters, toolParams);
        assert.strictEqual(assistantToolCallPart.name, 'grug_get_specific_thought');

        const userToolResultMessage = secondMessagesToLLM[3];
        assert.strictEqual(userToolResultMessage.role, vscode.LanguageModelChatMessageRole.User); // Tool results are User role
        assert.strictEqual(userToolResultMessage.content.length, 1);
        const toolResultPart = userToolResultMessage.content[0] as vscode.LanguageModelToolResultPart;
        assert.strictEqual(toolResultPart.callId, toolCallId);
        assert.strictEqual((toolResultPart.content[0] as vscode.LanguageModelTextPart).value, toolResultContent);

        const optionsToLLM1 = firstLLMCallArgs[1] as vscode.LanguageModelChatRequestOptions;
        assert.deepStrictEqual(optionsToLLM1.tools, mockGrugChatTools, "Tool definitions should be passed to first sendRequest");
        const optionsToLLM2 = secondLLMCallArgs[1] as vscode.LanguageModelChatRequestOptions;
        assert.deepStrictEqual(optionsToLLM2.tools, mockGrugChatTools, "Tool definitions should be passed to second sendRequest");
    });

    test('Scenario: Tool Call Fails', async () => {
        const userPrompt = "What Grug think of Agile?";
        const toolCallId = "tool_call_agile_fail";
        const toolParams = { topic: "agile" };
        const toolErrorMessage = "Tool boom!";

        mockLanguageModel.sendRequest.onFirstCall().resolves(createMockChatResponse([
            new vscode.LanguageModelToolCallPart(toolCallId, 'grug_get_specific_thought', toolParams)
        ]));
        invokeToolStub.withArgs('grug_get_specific_thought', sinon.match({ input: toolParams })).rejects(new Error(toolErrorMessage));
        mockLanguageModel.sendRequest.onSecondCall().resolves(createMockChatResponse([
            "Grug sorry, Grug tool broken for 'agile'."
        ]));

        const request: vscode.ChatRequest = {
            prompt: userPrompt, command: undefined, references: [],
            toolInvocationToken: { value: 'test-token-fail', isCancellationRequested: false, onCancellationRequested: sandbox.stub() } as any,
            participant: 'Grug', location: vscode.ChatLocation.Panel
        };
        const context: vscode.ChatContext = { history: [] };
        const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: sandbox.stub() };

        await chatHandler(request, context, mockStream as any, token);

        assert.ok(mockStream.markdown.calledWith(`\n\nGrug error using tool grug_get_specific_thought: ${toolErrorMessage}\n\n`), 'Markdown should show tool error message');
        assert.ok(mockStream.markdown.calledWith("Grug sorry, Grug tool broken for 'agile'."), 'Markdown should show final LLM apology');
        assert.ok(invokeToolStub.calledOnce);

        const secondLLMCallArgs = mockLanguageModel.sendRequest.getCall(1).args;
        const secondMessagesToLLM = secondLLMCallArgs[0] as vscode.LanguageModelChatMessage[];
        
        const userToolResultMessage = secondMessagesToLLM.find(
            msg => msg.role === vscode.LanguageModelChatMessageRole.User && 
                   msg.content[0] instanceof vscode.LanguageModelToolResultPart
        );
        assert.ok(userToolResultMessage, "Should find user message with tool result part");
        const toolResultPart = userToolResultMessage!.content[0] as vscode.LanguageModelToolResultPart;
        assert.strictEqual(toolResultPart.callId, toolCallId);
        assert.ok((toolResultPart.content[0] as vscode.LanguageModelTextPart).value.includes(toolErrorMessage), "Tool result content should include the error message");
    });

    test('Scenario: Iterative Tool Calls (Tool A -> Result A -> Tool B -> Result B -> Text)', async () => {
        const userPrompt = "Tell me a random thought, then about APIs.";
        const randomToolCallId = "random_call_001";
        const apiToolCallId = "api_call_002";

        const randomThoughtResult = "Grug like shiny rock.";
        const apiThoughtResult = "APIs are like cave paintings for other Grugs.";

        // 1. LLM asks for random thought
        mockLanguageModel.sendRequest.onFirstCall().resolves(createMockChatResponse([
            new vscode.LanguageModelToolCallPart(randomToolCallId, 'grug_get_random_thought', {})
        ]));
        invokeToolStub.withArgs('grug_get_random_thought').resolves({
            content: [new vscode.LanguageModelTextPart(randomThoughtResult)]
        });

        // 2. LLM gets random thought result, then asks for API thought
        mockLanguageModel.sendRequest.onSecondCall().resolves(createMockChatResponse([
            "Grug found random thought for you. Now about APIs...", // LLM text before second tool call
            new vscode.LanguageModelToolCallPart(apiToolCallId, 'grug_get_specific_thought', { topic: "APIs" })
        ]));
        invokeToolStub.withArgs('grug_get_specific_thought', sinon.match({ input: { topic: "APIs" } })).resolves({
            content: [new vscode.LanguageModelTextPart(apiThoughtResult)]
        });
        
        // 3. LLM gets API thought result, then gives final text
        mockLanguageLanguagemodel.sendRequest.onThirdCall().resolves(createMockChatResponse([
            "Okay, Grug told you about APIs too."
        ]));


        const request: vscode.ChatRequest = {
            prompt: userPrompt, command: undefined, references: [],
            toolInvocationToken: { value: 'test-token-iterative', isCancellationRequested: false, onCancellationRequested: sandbox.stub() } as any,
            participant: 'Grug', location: vscode.ChatLocation.Panel
        };
        const context: vscode.ChatContext = { history: [] };
        const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: sandbox.stub() };

        await chatHandler(request, context, mockStream as any, token);

        // Check markdown calls
        assert.ok(mockStream.markdown.calledWith("Grug found random thought for you. Now about APIs..."));
        assert.ok(mockStream.markdown.calledWith("Okay, Grug told you about APIs too."));

        // Check progress calls
        assert.ok(mockStream.progress.calledWith('Grug use tool: grug_get_random_thought...'));
        assert.ok(mockStream.progress.calledWith('Tool grug_get_random_thought finished.'));
        assert.ok(mockStream.progress.calledWith('Grug use tool: grug_get_specific_thought...'));
        assert.ok(mockStream.progress.calledWith('Tool grug_get_specific_thought finished.'));
        
        // Check invokeTool calls
        assert.strictEqual(invokeToolStub.callCount, 2);
        assert.ok(invokeToolStub.calledWith('grug_get_random_thought'));
        assert.ok(invokeToolStub.calledWith('grug_get_specific_thought', sinon.match({ input: { topic: "APIs" } })));

        // Check message history evolution (simplified checks for brevity)
        const firstLLMCallMessages = mockLanguageModel.sendRequest.getCall(0).args[0] as vscode.LanguageModelChatMessage[];
        assert.strictEqual(firstLLMCallMessages.length, 2); // Initial + User

        const secondLLMCallMessages = mockLanguageModel.sendRequest.getCall(1).args[0] as vscode.LanguageModelChatMessage[];
        assert.strictEqual(secondLLMCallMessages.length, 2 + 2); // Prev + AssistantToolCall(Random) + UserToolResult(Random)
        const assistantMsg1 = secondLLMCallMessages[2];
        assert.strictEqual((assistantMsg1.content[0] as vscode.LanguageModelToolCallPart).name, 'grug_get_random_thought');
        const userMsg1 = secondLLMCallMessages[3];
        assert.strictEqual(((userMsg1.content[0] as vscode.LanguageModelToolResultPart).content[0] as vscode.LanguageModelTextPart).value, randomThoughtResult);


        const thirdLLMCallMessages = mockLanguageModel.sendRequest.getCall(2).args[0] as vscode.LanguageModelChatMessage[];
        assert.strictEqual(thirdLLMCallMessages.length, 2 + 2 + 2); // Prev + AssistantTextAndToolCall(API) + UserToolResult(API)
        const assistantMsg2 = thirdLLMCallMessages[4]; // TextPart + ToolCallPart
        assert.ok(assistantMsg2.content[0] instanceof vscode.LanguageModelTextPart);
        assert.strictEqual((assistantMsg2.content[1] as vscode.LanguageModelToolCallPart).name, 'grug_get_specific_thought');
        const userMsg2 = thirdLLMCallMessages[5];
        assert.strictEqual(((userMsg2.content[0] as vscode.LanguageModelToolResultPart).content[0] as vscode.LanguageModelTextPart).value, apiThoughtResult);

    });
    
    // Test for empty user prompt but with history (should still proceed)
    test('Handles empty user prompt if history exists', async () => {
        mockLanguageModel.sendRequest.resolves(createMockChatResponse(["Grug remember things."]));

        const request: vscode.ChatRequest = {
            prompt: " ", // Empty or whitespace
            command: undefined, references: [],
            toolInvocationToken: { value: 'test-token-empty', isCancellationRequested: false, onCancellationRequested: sandbox.stub() } as any,
            participant: 'Grug', location: vscode.ChatLocation.Panel
        };
        const context: vscode.ChatContext = { 
            history: [
                { participant: 'Grug', prompt: 'Hello Grug', commands: [], references: [], response: Promise.resolve([]) } as vscode.ChatRequestTurn,
                { participant: 'Grug', response: [new vscode.ChatResponseMarkdownPart("Grug say hi")] } as vscode.ChatResponseTurn,
            ]
        };
        const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: sandbox.stub() };

        await chatHandler(request, context, mockStream as any, token);

        assert.ok(mockStream.markdown.calledWith("Grug remember things."), 'Markdown should be called');
        const firstCallArgs = mockLanguageModel.sendRequest.getCall(0).args;
        const messagesToLLM = firstCallArgs[0] as vscode.LanguageModelChatMessage[];
        // Initial Grug prompt, History (User, Assistant), Default Grug advice (since prompt is empty)
        assert.strictEqual(messagesToLLM.length, 1 + 2 + 1, "Should have initial, history, and default Grug advice message");
        assert.strictEqual(messagesToLLM[3].content, "grug give developer advice"); // Default message for empty prompt
    });

    test('Handles cancellation during LLM response streaming', async () => {
        const cancellationTokenSource = new vscode.CancellationTokenSource();
        const token = cancellationTokenSource.token;

        mockLanguageModel.sendRequest.resolves({
            text: (async function* () {
                yield "Grug start thinking...";
                cancellationTokenSource.cancel(); // Cancel mid-stream
                yield "Grug think more..."; // This should not be processed fully
            })()
        });
        
        const request: vscode.ChatRequest = {
            prompt: "Long thought please", command: undefined, references: [],
            toolInvocationToken: { value: 'test-token-cancel', isCancellationRequested: false, onCancellationRequested: sandbox.stub() } as any,
            participant: 'Grug', location: vscode.ChatLocation.Panel
        };
        const context: vscode.ChatContext = { history: [] };

        await chatHandler(request, context, mockStream as any, token);

        assert.ok(mockStream.markdown.calledWith("Grug start thinking..."));
        assert.ok(mockStream.markdown.calledWith("\n\nGrug stop, request cancelled while Grug talk."), "Cancellation message should be streamed");
        assert.ok(mockLanguageModel.sendRequest.getCall(0).args[0].length > 0, "sendRequest was called");
        // Check that no further messages were added to history or processed beyond cancellation
    });
});
