import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { GetRandomThoughtTool, GetSpecificThoughtTool, ISpecificThoughtParameters } from '../../chat/tools';
import * as extensionContext from '../../extensionContext';

const availableTopicsEnum = [
    "APIs", "DRY", "agile", "chestertonsFence", "closures", "conclusion",
    "concurrency", "eternalEnemyComplexity", "expressionComplexity",
    "factoringYourCode", "fads", "fearOfLookingDumb", "frontEndDevelopment",
    "imposterSyndrome", "introduction", "logging", "microservices", "optimizing",
    "parsing", "refactoring", "sayingNo", "sayingOk", "separationOfConcerns",
    "testing", "tools", "typeSystems", "visitorPattern"
];
const availableTopicsString = availableTopicsEnum.join(', ');


suite('GetRandomThoughtTool Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let mockExtensionContext: vscode.ExtensionContext;
    let readDirectoryStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();

        mockExtensionContext = {
            extensionUri: vscode.Uri.file('/ext/'),
            // Add other properties as needed, though tools.ts only uses extensionUri
        } as vscode.ExtensionContext;
        sandbox.stub(extensionContext, 'getExtensionContext').returns(mockExtensionContext);

        readDirectoryStub = sandbox.stub(vscode.workspace.fs, 'readDirectory');
        readFileStub = sandbox.stub(vscode.workspace.fs, 'readFile');
    });

    teardown(() => {
        sandbox.restore();
    });

    test('prepareInvocation returns correct message', () => {
        const tool = new GetRandomThoughtTool();
        const result = tool.prepareInvocation();
        assert.deepStrictEqual(result, {
            label: "Grug is searching for a random thought...",
            userMessage: "Grug is searching for a random thought...",
            toolExecutionMessage: "Grug is searching for a random thought..."
        });
    });

    test('Successful invocation returns random thought', async () => {
        const tool = new GetRandomThoughtTool();
        const files: [string, vscode.FileType][] = [
            ['prompt.md', vscode.FileType.File],
            ['thought1.md', vscode.FileType.File],
            ['thought2.txt', vscode.FileType.File], // Should be ignored
            ['deep_thought.md', vscode.FileType.File],
            ['another.md', vscode.FileType.File],
        ];
        readDirectoryStub.resolves(files);

        const thought1Content = new TextEncoder().encode('Content of thought1');
        const deepThoughtContent = new TextEncoder().encode('Content of deep_thought');
        const anotherContent = new TextEncoder().encode('Content of another');

        readFileStub.withArgs(vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', 'thought1.md')).resolves(thought1Content);
        readFileStub.withArgs(vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', 'deep_thought.md')).resolves(deepThoughtContent);
        readFileStub.withArgs(vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', 'another.md')).resolves(anotherContent);
        
        const possibleContents = ['Content of thought1', 'Content of deep_thought', 'Content of another'];
        
        // Run multiple times to increase chance of hitting different random choices
        let success = false;
        for (let i = 0; i < 10; i++) {
            const result = await tool.invoke({} as any, vscode.CancellationToken.None);
            if (result.parts && result.parts.length > 0 && result.parts[0] instanceof vscode.LanguageModelTextPart) {
                 const textFromResult = result.parts[0].value;
                 if (possibleContents.includes(textFromResult)) {
                    success = true;
                    // break; // Can break if one success is enough, or run more to test randomness better
                 }
            }
        }
        assert.ok(success, `Result content should be one of: ${possibleContents.join(', ')}`);
    });

    test('Error: Empty references directory (after excluding prompt.md)', async () => {
        const tool = new GetRandomThoughtTool();
        readDirectoryStub.resolves([['prompt.md', vscode.FileType.File]]);
        
        try {
            await tool.invoke({} as any, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.message, "Grug has no thoughts to share at the moment (no suitable markdown files found in 'references').");
        }
    });

    test('Error: readDirectory fails', async () => {
        const tool = new GetRandomThoughtTool();
        readDirectoryStub.rejects(new Error('FS Error'));
        
        try {
            await tool.invoke({} as any, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.message, "Grug can't find his thoughts! The 'references' directory seems to be missing.");
        }
    });

    test('Error: readFile fails', async () => {
        const tool = new GetRandomThoughtTool();
        readDirectoryStub.resolves([['thought1.md', vscode.FileType.File]]);
        readFileStub.rejects(new Error('Read Error'));
        
        try {
            await tool.invoke({} as any, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.ok(e.message.startsWith('Error invoking GetRandomThoughtTool: Read Error') || e.message === 'Read Error');
        }
    });

     test('Cancellation before readFile', async () => {
        const tool = new GetRandomThoughtTool();
        readDirectoryStub.resolves([['thought1.md', vscode.FileType.File]]);
        const token = new vscode.CancellationTokenSource();
        token.cancel(); // Cancel before invoke calls readFile

        try {
            await tool.invoke({} as any, token.token);
            assert.fail('Should have thrown a cancellation error');
        } catch (e: any) {
            assert.strictEqual(e.message, "Grug's thought retrieval was cancelled by user.");
        }
    });
});


suite('GetSpecificThoughtTool Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let mockExtensionContext: vscode.ExtensionContext;
    let readFileStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        mockExtensionContext = {
            extensionUri: vscode.Uri.file('/ext/'),
        } as vscode.ExtensionContext;
        sandbox.stub(extensionContext, 'getExtensionContext').returns(mockExtensionContext);
        readFileStub = sandbox.stub(vscode.workspace.fs, 'readFile');
    });

    teardown(() => {
        sandbox.restore();
    });

    test('prepareInvocation with topic returns specific message', () => {
        const tool = new GetSpecificThoughtTool();
        const result = tool.prepareInvocation({ input: { topic: 'APIs' } } as any);
        const expectedMessage = "Grug is retrieving thoughts on 'APIs'...";
        assert.deepStrictEqual(result, {
            label: expectedMessage,
            userMessage: expectedMessage,
            toolExecutionMessage: expectedMessage
        });
    });

    test('prepareInvocation with no topic returns generic message', () => {
        const tool = new GetSpecificThoughtTool();
        const result = tool.prepareInvocation({ input: {} } as any);
        const expectedMessage = "Grug is preparing to retrieve a specific thought...";
        assert.deepStrictEqual(result, {
            label: expectedMessage,
            userMessage: expectedMessage,
            toolExecutionMessage: expectedMessage
        });
    });

    test('Successful invocation (topic without .md)', async () => {
        const tool = new GetSpecificThoughtTool();
        const content = new TextEncoder().encode('Content for APIs');
        readFileStub.withArgs(vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', 'APIs.md')).resolves(content);
        
        const result = await tool.invoke({ input: { topic: 'APIs' } }, vscode.CancellationToken.None);
        assert.ok(result.parts && result.parts.length > 0 && result.parts[0] instanceof vscode.LanguageModelTextPart);
        assert.strictEqual(result.parts[0].value, 'Content for APIs');
    });

    test('Successful invocation (topic with .md)', async () => {
        const tool = new GetSpecificThoughtTool();
        const content = new TextEncoder().encode('Content for testing');
        readFileStub.withArgs(vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', 'testing.md')).resolves(content);
        
        const result = await tool.invoke({ input: { topic: 'testing.md' } }, vscode.CancellationToken.None);
        assert.ok(result.parts && result.parts.length > 0 && result.parts[0] instanceof vscode.LanguageModelTextPart);
        assert.strictEqual(result.parts[0].value, 'Content for testing');
    });
    
    test('Successful invocation (topic with .md.md)', async () => {
        const tool = new GetSpecificThoughtTool();
        const content = new TextEncoder().encode('Content for DRY');
        // The tool should normalize "DRY.md.md" to "DRY.md"
        readFileStub.withArgs(vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', 'DRY.md')).resolves(content);
        
        const result = await tool.invoke({ input: { topic: 'DRY.md.md' } }, vscode.CancellationToken.None);
        assert.ok(result.parts && result.parts.length > 0 && result.parts[0] instanceof vscode.LanguageModelTextPart);
        assert.strictEqual(result.parts[0].value, 'Content for DRY');
    });


    test('Error: Topic not provided', async () => {
        const tool = new GetSpecificThoughtTool();
        try {
            await tool.invoke({ input: {} }, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.message, `Grug needs a topic to share thoughts about. Please provide a topic. Grug knows about: ${availableTopicsString}.`);
        }
    });
    
    test('Error: Topic (empty string) not provided', async () => {
        const tool = new GetSpecificThoughtTool();
        try {
            await tool.invoke({ input: {topic: '  '} }, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.message, `Grug needs a topic to share thoughts about. Please provide a topic. Grug knows about: ${availableTopicsString}.`);
        }
    });

    test('Error: Topic not in allowed list (file not found)', async () => {
        const tool = new GetSpecificThoughtTool();
        const topic = 'nonExistent';
        const fileUri = vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', `${topic}.md`);
        // This stub is for the internal check against availableTopics, the readFile error below is secondary
        // readFileStub.withArgs(fileUri).throws(vscode.FileSystemError.FileNotFound(fileUri));

        try {
            await tool.invoke({ input: { topic } }, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            // This error comes from the availableTopics check
            assert.strictEqual(e.message, `Grug has no thoughts on topic '${topic}'. Grug only knows about: ${availableTopicsString}.`);
        }
    });
    
    test('Error: Topic in allowed list but readFile throws FileNotFound', async () => {
        const tool = new GetSpecificThoughtTool();
        const topic = 'APIs'; // This topic IS in availableTopicsEnum
        const filename = 'APIs.md';
        const fileUri = vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', filename);
        readFileStub.withArgs(fileUri).throws(vscode.FileSystemError.FileNotFound(fileUri));

        try {
            await tool.invoke({ input: { topic } }, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
            assert.strictEqual(e.message, `Grug has no thoughts on topic '${topic}'. Grug only knows about: ${availableTopicsString}. (File ${filename} not found).`);
        }
    });


    test('Error: readFile throws a generic error', async () => {
        const tool = new GetSpecificThoughtTool();
        const topic = 'APIs'; // Assumed to be an allowed topic
        const filename = 'APIs.md';
        readFileStub.withArgs(vscode.Uri.joinPath(mockExtensionContext.extensionUri, 'references', filename)).rejects(new Error('Read failed'));
        
        try {
            await tool.invoke({ input: { topic } }, vscode.CancellationToken.None);
            assert.fail('Should have thrown an error');
        } catch (e: any) {
             // The error message changed in tools.ts to be more specific
            assert.strictEqual(e.message, `Error reading Grug's thought on '${topic}': Read failed`);
        }
    });

    test('Cancellation before readFile', async () => {
        const tool = new GetSpecificThoughtTool();
        const token = new vscode.CancellationTokenSource();
        token.cancel();

        try {
            await tool.invoke({ input: { topic: 'APIs' } }, token.token);
            assert.fail('Should have thrown a cancellation error');
        } catch (e: any) {
            assert.strictEqual(e.message, "Grug's thought retrieval was cancelled by user.");
        }
    });
});
