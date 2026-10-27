import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Matrix rain stays aligned while a panel enters', async () => {
	const source = await readFile(new URL('../src/shared/ui/ascii-backdrop/index.tsx', import.meta.url), 'utf8');
	assert.match(source, /syncCodeRain\(\);\s*if \(props\.placement === "modal"\) \{\s*entryFrame = window\.requestAnimationFrame\(syncDuringEntrance\)/);
	assert.match(source, /const syncDuringEntrance = \(\) => \{[\s\S]*?getBoundingClientRect\(\)[\s\S]*?requestAnimationFrame\(syncDuringEntrance\)/);
	assert.match(source, /cancelAnimationFrame\(entryFrame\)/);
	assert.doesNotMatch(source, /setTimeout\(syncCodeRain/);
});

test('background intensity controls effect quantity, not opacity', async () => {
	const [source, styles, app] = await Promise.all([
		readFile(new URL('../src/shared/ui/ascii-backdrop/index.tsx', import.meta.url), 'utf8'),
		readFile(new URL('../src/shared/ui/ascii-backdrop/style.css.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8'),
	]);
	assert.ok(app.includes('<BackgroundIntensityProvider value={app.preferences.backgroundIntensity}>'));
	assert.match(source, /randomAt\(seed\) >= intensity \* CODE_RAIN_MAX_DENSITY/);
	assert.match(source, /randomAt\(CODE_RAIN_SEED \+ row \* line\.length \+ column\) >= intensity/);
	assert.match(source, /renderCodeRain\(codeFallDuration\(\), codeRainElapsed\(\), intensity\(\)\)/);
	assert.match(source, /renderConstellation\(animationSeed, intensity\(\)\)/);
	assert.match(styles, /opacity: 0\.56/);
	assert.doesNotMatch(styles, /background-effects-intensity/);
});
