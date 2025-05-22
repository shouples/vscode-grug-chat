import * as vscode from 'vscode';
import { getExtensionContext } from '../extensionContext'; // Assuming this path is correct

// Helper function to decode Uint8Array to string
function decodeUint8Array(uint8Array: Uint8Array): string {
    return new TextDecoder().decode(uint8Array);
}

export interface ISpecificThoughtParameters {
    topic?: string;
}

export class GetRandomThoughtTool implements vscode.LanguageModelTool<void> {
    readonly name = 'grug_get_random_thought'; // Matches package.json
    readonly description = 'Retrieves a random thought from Grug.'; // User-facing description for UI/quick pick
    // modelDescription from package.json: "Retrieves a random thought or piece of wisdom from Grug's collection of markdown files in the 'references/' directory, excluding 'prompt.md'."


    prepareInvocation(): vscode.ProviderResult<vscode.LanguageModelToolInvocation> {
        const message = "Grug is searching for a random thought...";
        return { 
            label: message, // Short label for UI
            userMessage: message, 
            toolExecutionMessage: message 
        };
    }

    async invoke(options: vscode.LanguageModelToolInvocationOptions<void>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
        try {
            const extensionContext = getExtensionContext();
            if (!extensionContext) {
                // This should ideally not happen if extension activates correctly
                throw new Error("Error: Extension context not available.");
            }
            const referencesUri = vscode.Uri.joinPath(extensionContext.extensionUri, 'references');

            let filesInReferences: [string, vscode.FileType][];
            try {
                filesInReferences = await vscode.workspace.fs.readDirectory(referencesUri);
            } catch (e: any) {
                console.error("Error reading references directory:", e);
                throw new Error("Grug can't find his thoughts! The 'references' directory seems to be missing.");
            }

            const markdownFiles = filesInReferences
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md') && name !== 'prompt.md')
                .map(([name, _type]) => name);

            if (markdownFiles.length === 0) {
                throw new Error("Grug has no thoughts to share at the moment (no suitable markdown files found in 'references').");
            }

            const randomFileName = markdownFiles[Math.floor(Math.random() * markdownFiles.length)];
            const fileUri = vscode.Uri.joinPath(referencesUri, randomFileName);
            
            if (token.isCancellationRequested) {
                throw new Error("Grug's thought retrieval was cancelled by user.");
            }
            
            const fileContentUint8Array = await vscode.workspace.fs.readFile(fileUri);
            if (token.isCancellationRequested) { // Check again after async operation
                throw new Error("Grug's thought retrieval was cancelled by user.");
            }
            const fileContent = decodeUint8Array(fileContentUint8Array);

            return { parts: [new vscode.LanguageModelTextPart(fileContent)] };
        } catch (error: any) {
            console.error("Error in GetRandomThoughtTool invoke:", error);
            // If it's already an error we threw, re-throw it. Otherwise, wrap it.
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`Error invoking GetRandomThoughtTool: ${error.message || 'An unexpected error occurred.'}`);
        }
    }
}

export class GetSpecificThoughtTool implements vscode.LanguageModelTool<ISpecificThoughtParameters> {
    readonly name = 'grug_get_specific_thought'; // Matches package.json
    readonly description = 'Retrieves Grug\'s thoughts on a specific topic.'; // User-facing description for UI/quick pick
    // modelDescription from package.json: "Retrieves Grug's thoughts on a specific topic. The topic must be one of the available markdown files in the 'references/' directory, excluding 'prompt.md'."

    private readonly availableTopics: string[] = [ // From package.json enum
        "APIs", "DRY", "agile", "chestertonsFence", "closures", "conclusion", 
        "concurrency", "eternalEnemyComplexity", "expressionComplexity", 
        "factoringYourCode", "fads", "fearOfLookingDumb", "frontEndDevelopment", 
        "imposterSyndrome", "introduction", "logging", "microservices", "optimizing", 
        "parsing", "refactoring", "sayingNo", "sayingOk", "separationOfConcerns", 
        "testing", "tools", "typeSystems", "visitorPattern"
    ];

    prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ISpecificThoughtParameters>): vscode.ProviderResult<vscode.LanguageModelToolInvocation> {
        let message: string;
        if (options.input?.topic) {
            message = `Grug is retrieving thoughts on '${options.input.topic}'...`;
        } else {
            message = "Grug is preparing to retrieve a specific thought...";
        }
        return { label: message, userMessage: message, toolExecutionMessage: message };
    }

    async invoke(options: vscode.LanguageModelToolInvocationOptions<ISpecificThoughtParameters>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
        try {
            const topic = options.input?.topic;

            if (!topic || topic.trim() === '') {
                throw new Error(`Grug needs a topic to share thoughts about. Please provide a topic. Grug knows about: ${this.availableTopics.join(', ')}.`);
            }

            let filename = topic.trim();
            if (filename.endsWith('.md.md')) { // Handle accidental double extension first
                 filename = filename.substring(0, filename.length - 3);
            }
            if (!filename.endsWith('.md')) {
                filename = `${filename}.md`;
            }
            
            // Check if the requested topic (without .md) is in the list of available topics
            const topicBaseName = filename.substring(0, filename.length - 3);
            if (!this.availableTopics.includes(topicBaseName) && topicBaseName !== 'prompt') { // prompt.md is excluded
                 const errorMessage = `Grug has no thoughts on topic '${topicBaseName}'. Grug only knows about: ${this.availableTopics.join(', ')}.`;
                return { parts: [new vscode.LanguageModelTextPart(errorMessage)] };
            }


            const extensionContext = getExtensionContext();
            if (!extensionContext) {
                return { parts: [new vscode.LanguageModelTextPart("Error: Extension context not available.")] };
            }
            const fileUri = vscode.Uri.joinPath(extensionContext.extensionUri, 'references', filename);

            try {
                const fileContentUint8Array = await vscode.workspace.fs.readFile(fileUri);
                if (token.isCancellationRequested) {
                    return { parts: [new vscode.LanguageModelTextPart("Grug's thought retrieval was cancelled.")] };
                }
                const fileContent = decodeUint8Array(fileContentUint8Array);
                return { parts: [new vscode.LanguageModelTextPart(fileContent)] };
            } catch (e: any) {
                // File not found or other read error
                console.error(`Error reading file for topic '${topic}':`, e);
                const errorMessage = `Grug has no thoughts on topic '${topic}'. Grug only knows about: ${this.availableTopics.join(', ')}. (Attempted to read: ${filename})`;
                return { parts: [new vscode.LanguageModelTextPart(errorMessage)] };
            }
        } catch (error: any) {
            console.error("Error in GetSpecificThoughtTool invoke:", error);
            const errorMessage = `Error invoking GetSpecificThoughtTool: ${error.message || 'An unexpected error occurred.'}`;
            return { parts: [new vscode.LanguageModelTextPart(errorMessage)] };
        }
    }
}
