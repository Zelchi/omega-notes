import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const source = async path => (await readFile(new URL(path, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const frontendRoot = fileURLToPath(new URL('../src/', import.meta.url));

const typescriptFiles = async directory => {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(entry => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return typescriptFiles(path);
		return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
	}));
	return nested.flat();
};

test('backend commands match the Electron allowlist, frontend consumers, and Tauri dispatch route', async () => {
	const [allowlistText, dispatch, electron, tauri] = await Promise.all([
		source('../../bridge/electron/backend-commands.json'),
		source('../../backend/src/dispatch.rs'),
		source('../../bridge/electron/main.mjs'),
		source('../src/shared/lib/desktop-tauri.ts'),
	]);
	const allowedCommands = JSON.parse(allowlistText);
	const dispatchedCommands = [...dispatch.matchAll(/^\s*"([^"]+)"\s*=>/gm)].map(match => match[1]);
	assert.equal(new Set(allowedCommands).size, allowedCommands.length, 'Electron allowlist has no duplicate commands');
	assert.equal(new Set(dispatchedCommands).size, dispatchedCommands.length, 'Rust dispatch has no duplicate command arms');
	assert.deepEqual([...dispatchedCommands].sort(), [...allowedCommands].sort());

	const frontend = (await Promise.all((await typescriptFiles(frontendRoot)).map(path => readFile(path, 'utf8')))).join('\n');
	const invokedCommands = new Set([...frontend.matchAll(/\b(?:invoke|invokeCancellable|command)(?:<[^>\n]*>)?\s*\(\s*["']([^"']+)["']/g)].map(match => match[1]));
	assert.deepEqual(allowedCommands.filter(command => !invokedCommands.has(command)), [], 'every backend command has a frontend consumer');

	const configPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	assert.equal(configFile.error, undefined, 'frontend TypeScript config loads');
	const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath));
	const frontendFiles = await typescriptFiles(frontendRoot);
	const program = ts.createProgram({ rootNames: frontendFiles, options: config.options });
	const checker = program.getTypeChecker();
	const frontendArguments = new Map();
	const addTypeProperties = (expression, keys) => {
		for (const property of checker.getPropertiesOfType(checker.getTypeAtLocation(expression))) keys.add(property.getName());
	};
	const addCallArguments = node => {
		if (ts.isCallExpression(node)
			&& ts.isIdentifier(node.expression)
			&& ['invoke', 'invokeCancellable', 'command'].includes(node.expression.text)
			&& ts.isStringLiteral(node.arguments[0])) {
			const command = node.arguments[0].text;
			const argument = node.arguments[1];
			const keys = frontendArguments.get(command) ?? new Set();
			if (argument && ts.isObjectLiteralExpression(argument)) {
				for (const property of argument.properties) {
					if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
						if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) keys.add(property.name.text);
						else addTypeProperties(property.name, keys);
					} else if (ts.isSpreadAssignment(property)) addTypeProperties(property.expression, keys);
				}
			} else if (argument) addTypeProperties(argument, keys);
			if (node.expression.text === 'invokeCancellable') keys.add('operationId');
			frontendArguments.set(command, keys);
		}
		ts.forEachChild(node, addCallArguments);
	};
	for (const file of frontendFiles) {
		const sourceFile = program.getSourceFile(file);
		if (sourceFile) addCallArguments(sourceFile);
	}
	const rustArguments = new Map();
	for (const [index, match] of dispatchedCommands.entries()) {
		const start = dispatch.indexOf(`"${match}" =>`);
		const next = index + 1 < dispatchedCommands.length
			? dispatch.indexOf(`"${dispatchedCommands[index + 1]}" =>`, start + 1)
			: dispatch.indexOf('\n        _ =>', start);
		const arm = dispatch.slice(start, next < 0 ? dispatch.length : next);
		const keys = new Set([
			...arm.matchAll(/argument\(&args,\s*"([^"]+)"\)/g),
			...arm.matchAll(/Channel::from_argument\(&app,\s*&args,\s*"([^"]+)"\)/g),
		].map(match => match[1]));
		rustArguments.set(match, keys);
	}
	for (const command of allowedCommands) {
		const expected = rustArguments.get(command) ?? new Set();
		const provided = frontendArguments.get(command) ?? new Set();
		assert.deepEqual([...expected].filter(key => !provided.has(key)), [], `${command} frontend provides every dispatch argument`);
		assert.deepEqual([...provided].filter(key => !expected.has(key)), [], `${command} frontend does not send unknown dispatch arguments`);
	}

	const tauriCommands = new Set([...tauri.matchAll(/case '([^']+)'/g)].map(match => match[1]));
	assert.deepEqual(allowedCommands.filter(command => tauriCommands.has(command)), [], 'backend commands are not shadowed by Tauri host commands');
	assert.match(tauri, /default:\s*return await tauriInvoke<T>\('desktop_dispatch', \{ command, args \}\)/);
	assert.match(electron, /commands\.has\(command\)[\s\S]*?return backend\.invoke\(command, args\)/);
});
