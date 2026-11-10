import assert from 'node:assert/strict';
import test from 'node:test';
import { convertHtmlClipboardBody } from '../src/shared/lib/html-clipboard-to-note-text.ts';
import { parseFormattedText } from '../src/shared/lib/formatted-text.ts';

const text = value => ({ nodeType: 3, textContent: value, childNodes: [] });
const element = (tagName, children = [], attributes = {}, style = {}) => {
	const node = {
		nodeType: 1,
		tagName: tagName.toUpperCase(),
		childNodes: children,
		style: {
			fontWeight: '', fontStyle: '', textDecorationLine: '', textDecoration: '', backgroundColor: '', fontFamily: '', textAlign: '',
			...style,
		},
		className: attributes.class ?? '',
		getAttribute(name) { return attributes[name] ?? null; },
		querySelector(selector) {
			const expected = selector.toUpperCase();
			const visit = current => {
				for (const child of current.childNodes ?? []) {
					if (child.nodeType === 1 && child.tagName === expected) return child;
					const nested = child.nodeType === 1 ? visit(child) : undefined;
					if (nested) return nested;
				}
			};
			return visit(this);
		},
	};
	Object.defineProperty(node, 'textContent', {
		get: () => children.map(child => child.textContent ?? '').join(''),
	});
	return node;
};

test('rich clipboard HTML preserves supported inline formatting and safe links', () => {
	const body = element('body', [element('p', [
		text('Texto '), element('strong', [text('forte')]), text(' e '), element('em', [text('ênfase')]), text(' '),
		element('strong', [element('em', [text('ambos')])]), text(' '), element('s', [text('riscado')]), text(' '),
		element('mark', [text('realçado')]), text(' '), element('code', [text('código')]), text(' '),
		element('a', [text('site')], { href: 'https://example.com/path' }),
	])]);

	const converted = convertHtmlClipboardBody(body);
	assert.equal(converted, 'Texto **forte** e *ênfase* ***ambos*** ~~riscado~~ ==realçado== `código` [site](https://example.com/path)');
	const runs = parseFormattedText(converted)[0].runs;
	assert.deepEqual(runs.filter(run => run.bold || run.italic || run.strike || run.highlight || run.code).map(run => ({
		text: run.text, bold: Boolean(run.bold), italic: Boolean(run.italic), strike: Boolean(run.strike), highlight: Boolean(run.highlight), code: Boolean(run.code),
	})), [
		{ text: 'forte', bold: true, italic: false, strike: false, highlight: false, code: false },
		{ text: 'ênfase', bold: false, italic: true, strike: false, highlight: false, code: false },
		{ text: 'ambos', bold: true, italic: true, strike: false, highlight: false, code: false },
		{ text: 'riscado', bold: false, italic: false, strike: true, highlight: false, code: false },
		{ text: 'realçado', bold: false, italic: false, strike: false, highlight: true, code: false },
		{ text: 'código', bold: false, italic: false, strike: false, highlight: false, code: true },
	]);
});

test('rich clipboard HTML preserves headings, nested lists, quotes, code blocks, and tables', () => {
	const body = element('body', [
		element('h2', [text('Título')]),
		element('ul', [element('li', [text('item'), element('ul', [element('li', [text('interno')])])])]),
		element('ol', [element('li', [text('primeiro')]), element('li', [text('segundo')])], { start: '3' }),
		element('blockquote', [element('p', [text('citação')])]),
		element('pre', [element('code', [text('const answer = 42;')], { class: 'language-js' })]),
		element('table', [element('tbody', [
			element('tr', [element('th', [text('Nome')]), element('th', [text('Valor')], {}, { textAlign: 'right' })]),
			element('tr', [element('td', [text('item')]), element('td', [text('42')])]),
		])]),
	]);

	const converted = convertHtmlClipboardBody(body);
	assert.equal(converted, [
		'## Título',
		'- item\n  - interno',
		'3. primeiro\n4. segundo',
		'> citação',
		'``` js\nconst answer = 42;\n```',
		'| Nome | Valor |\n| :--- | ---: |\n| item | 42 |',
	].join('\n'));
	const blocks = parseFormattedText(converted);
	assert.equal(blocks[0].kind, 'heading');
	assert.equal(blocks[1].bullet.indent, '');
	assert.equal(blocks[2].bullet.indent, '  ');
	assert.equal(blocks[3].ordered.number, '3');
	assert.equal(blocks[5].quote, 1);
	assert.equal(blocks[6].kind, 'code');
	assert.equal(blocks[6].language, 'js');
	assert.equal(blocks[7].kind, 'table');
});
