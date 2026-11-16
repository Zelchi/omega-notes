import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Matrix rain uses global coordinates in the Engine canvas', async () => {
	const source = await readFile(new URL('../src/shared/ui/ascii-backdrop/index.tsx', import.meta.url), 'utf8');
	assert.match(source, /createMatrixPreset\(mountCanvas, intensity\)/);
	assert.match(source, /const bounds = context\.host\.getBoundingClientRect\(\)/);
	assert.match(source, /const x = column \/ matrixColumns \* viewportWidth - bounds\.left/);
	assert.match(source, /const y = -12 \+ phase \/ duration \* viewportHeight - bounds\.top/);
	assert.match(source, /ink: getComputedStyle\(engineElement\)\.color/);
	assert.match(source, /pen\.fillText\(character, x, y\)/);
});

test('background intensity controls effect density, not opacity', async () => {
	const [source, styles, app] = await Promise.all([
		readFile(new URL('../src/shared/ui/ascii-backdrop/index.tsx', import.meta.url), 'utf8'),
		readFile(new URL('../src/shared/ui/ascii-backdrop/style.css.ts', import.meta.url), 'utf8'),
		readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8'),
	]);
	assert.ok(app.includes('<BackgroundIntensityProvider value={app.preferences.backgroundIntensity}>'));
	assert.match(source, /const densityLimit = intensity\(\) \* CODE_RAIN_MAX_DENSITY/);
	assert.match(source, /createConstellationPreset\(mountCanvas, intensity, animationSeed\)/);
	assert.match(source, /if \(density >= densityLimit\) return/);
	assert.match(source, /const densityLimit = intensity\(\)/);
	assert.match(source, /const interval = 0\.7 \+ randomAt\(seed\) \* 3\.3/);
	assert.match(source, /if \(character === "\*" && !reducedMotion\)/);
	assert.doesNotMatch(source, /opacity: intensity\(\)/);
	assert.match(styles, /opacity: 0\.56/);
	assert.doesNotMatch(styles, /background-effects-intensity/);
});

test('Constellation uses only the Engine canvas renderer', async () => {
	const source = await readFile(new URL('../src/shared/ui/ascii-backdrop/index.tsx', import.meta.url), 'utf8');
	const styles = await readFile(new URL('../src/shared/ui/ascii-backdrop/style.css.ts', import.meta.url), 'utf8');
	assert.match(source, /type AsciiTheme = Exclude<BackgroundTheme, "default">/);
	assert.doesNotMatch(source, /\.join\("\\n\\n"\)/);
	assert.doesNotMatch(source, /\.join\(" {8}"\)/);
	assert.match(source, /createConstellationPreset\(mountCanvas, intensity, animationSeed\)/);
	assert.match(source, /constellationMarks\.forEach\(\(\{ character, row, column, seed: markSeed, density \}\)/);
	assert.match(source, /pen\.fillText\(character, left \+ column \* cellWidth, top \+ row \* frame\.fontSize\)/);
	assert.match(source, /randomAt\(CODE_RAIN_SEED \+ seed\)/);
	assert.doesNotMatch(source, /renderConstellation|renderCodeRain|renderGlyph|engineSupported|fallbackLayer|mountSurface|gpuStar|gpuDot|gpuBackground|theme\(\) === "asciify"/);
	assert.doesNotMatch(styles, /fallbackLayer|styles\.art|constellationGlyph|codeGlyph|codeRain|data-theme="asciify"|ascii-background-ink/);
});
