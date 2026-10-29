import test from 'node:test';
import assert from 'node:assert/strict';
import { occupiesWindowAxis } from '../src/app/model/window-axis.ts';

const sizes = (width, height, workWidth = 1920, workHeight = 1080) => ({ width, height, workWidth, workHeight });

test('Linux treats a fully occupied width or height as tiled', () => {
    assert.equal(occupiesWindowAxis(sizes(1920, 600), true), true);
    assert.equal(occupiesWindowAxis(sizes(1200, 1080), true), true);
});

test('Linux tolerance is the greater of 16px and 5% of each work-area axis', () => {
    assert.equal(occupiesWindowAxis(sizes(1904, 600), true), true, '16px width gap');
    assert.equal(occupiesWindowAxis(sizes(1200, 1064), true), true, '16px height gap');
    assert.equal(occupiesWindowAxis(sizes(1824, 600), true), true, '5% width gap');
    assert.equal(occupiesWindowAxis(sizes(1200, 1026), true), true, '5% height gap');
    assert.equal(occupiesWindowAxis(sizes(1823, 1025), true), false, 'just beyond 5% on both axes');
});

test('normal windows remain rounded and non-Linux tolerance remains 16px', () => {
    assert.equal(occupiesWindowAxis(sizes(1200, 800), true), false);
    assert.equal(occupiesWindowAxis(sizes(1904, 600), false), true, '16px gap');
    assert.equal(occupiesWindowAxis(sizes(1824, 600), false), false, '5% gap exceeds 16px');
});

test('missing or invalid dimensions do not count as occupying an axis', () => {
    for (const value of [null, undefined, {}, sizes(0, 800), sizes(1200, -1), sizes(NaN, 800), sizes(1200, 800, Infinity), sizes(1200, 800, 1920, 0)]) {
        assert.equal(occupiesWindowAxis(value, true), false, `invalid sizes: ${JSON.stringify(value)}`);
    }
});
