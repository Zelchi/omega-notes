import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClipboardText } from '../src/shared/lib/normalize-clipboard-text.ts';

test('clipboard text uses normalized line endings, omits an initial BOM, and uses NFC', () => {
	assert.equal(normalizeClipboardText('\uFEFFcafe\u0301\r\nsegunda linha\rterceira linha'), 'café\nsegunda linha\nterceira linha');
});

test('clipboard normalization preserves other zero-width characters', () => {
	assert.equal(normalizeClipboardText('a\u2060b'), 'a\u2060b');
});
