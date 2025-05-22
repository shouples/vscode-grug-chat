import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('Sinon Test Suite', () => {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const sinon = require('sinon');
	test('Should call vscode.window.showInformationMessage', () => {
		const spy = sinon.spy(vscode.window, 'showInformationMessage');
		vscode.window.showInformationMessage('Test message');
		assert(spy.calledOnce);
		spy.restore();
	});
});

import { formatGrugMessage } from '../chat/utils';

describe('Chat Utils Test Suite', () => {
	it('should format Grug\'s message correctly', () => {
		const input = '  hello world  ';
		const expectedOutput = 'Grug says: hello world';
		assert.strictEqual(formatGrugMessage(input), expectedOutput);
	});

	it('should handle empty input for Grug\'s message', () => {
		const input = '';
		const expectedOutput = 'Grug says: ';
		assert.strictEqual(formatGrugMessage(input), expectedOutput);
	});
});
