import test from 'node:test';
import assert from 'node:assert/strict';
import { graphEdgeKey, graphEdgePath, graphEdges, graphEdgesCrossedByStroke, graphEdgePointAt, nearestGraphEdgePoint, routeGraphEdges, slideZipTie, zipTiesAfterNodeMove, zipTieClearOfNotes, zipTiePlacement } from '../src/pages/canvas/lib/graph.ts';
import { readGraphState } from '../src/pages/canvas/api/graph.repository.ts';
import { mapTextOutsideCode } from '../src/shared/lib/formatted-text.ts';
import { recordNavigation, createNavigationHistory, findHistoryIndex } from '../src/app/model/navigation-history.ts';
import { summarizeNote } from '../src/entities/note/model/note-summary.ts';
import { note } from './helpers.mjs';

for (const prose of ['`[[b]]`', '```md\n[[b]]\n```', '~~~md\n[[b]]\n~~~', '[[b\n]]']) {
    test('literal or invalid references do not create graph edges: ' + JSON.stringify(prose), () => {
        assert.equal(graphEdges([summarizeNote(note('a', prose)), summarizeNote(note('b'))]).length, 0);
    });
}
test('graph resolves IDs and aliases and deduplicates reverse connections', () => {
    const a = note('a', '[[b|Alias]] [[b]]'), b = note('b', '[[a]]');
    assert.equal(graphEdges([summarizeNote(a), summarizeNote(b)]).length, 1);
    assert.equal(graphEdges([summarizeNote(b), summarizeNote(a)])[0].source.id, 'a');
});
test('graph resolves titles and skips missing and self references', () => {
    const a = note('a', '[[Note B]] [[missing]] [[a]]'), b = { ...note('b'), title: 'Note B' };
    assert.equal(graphEdges([summarizeNote(a), summarizeNote(b)]).length, 1);
});
test('zip-tie edge keys are independent of link direction', () => {
    const a = summarizeNote(note('a')), b = summarizeNote(note('b'));
    assert.equal(graphEdgeKey({ source:a, target:b }), graphEdgeKey({ source:b, target:a }));
});
test('zip-tie placement spans all wires crossed by the drawn line', () => {
    const a = summarizeNote(note('a')), b = summarizeNote(note('b'));
    const c = summarizeNote(note('c')), d = summarizeNote(note('d'));
    const edges = [{ source:a, target:b }, { source:c, target:d }];
    const edgeMap = new Map(edges.map(edge => [graphEdgeKey(edge), edge]));
    const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
    const near = { a:{x:0,y:0}, b:{x:500,y:0}, c:{x:0,y:8}, d:{x:500,y:8} };
    const far = { ...near, c:{x:0,y:100}, d:{x:500,y:100} };
    assert.ok(zipTiePlacement(tie, edgeMap, near, 4));
    assert.ok(zipTiePlacement(tie, edgeMap, far, 4));
});
test('zip-tie width grows visibly with each additional wire', () => {
    const notes = Array.from({ length:8 }, (_, index) => summarizeNote(note(`n${index}`)));
    const edges = Array.from({ length:4 }, (_, index) => ({ source:notes[index * 2], target:notes[index * 2 + 1] }));
    const positions = Object.fromEntries(notes.map((item, index) => [item.id, { x:index % 2 ? 500 : 0, y:Math.floor(index / 2) * 8 }]));
    const widths = [2, 3, 4].map(count => {
        const members = edges.slice(0, count).map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 }));
        return zipTiePlacement({ id:'tie', members }, new Map(edges.map(edge => [graphEdgeKey(edge), edge])), positions, notes.length).width;
    });
    assert.deepEqual(widths, [18, 24, 30]);
});
test('zip ties stop before overlapping a note', () => {
    const [a, b, shared] = ['a', 'b', 'z'].map(id => summarizeNote(note(id)));
    const edges = [{ source:a, target:shared }, { source:b, target:shared }];
    const positions = { a:{x:0,y:0}, b:{x:500,y:0}, z:{x:250,y:400} };
    const edgeMap = new Map(edges.map(edge => [graphEdgeKey(edge), edge]));
    const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
    const nearNote = { ...tie, members:tie.members.map(member => ({ ...member, t:.9 })) };
    const safePlacement = zipTiePlacement(tie, edgeMap, positions, 3);
    const blockedPlacement = zipTiePlacement(nearNote, edgeMap, positions, 3);
    assert.ok(safePlacement);
    assert.ok(blockedPlacement);
    assert.equal(zipTieClearOfNotes(safePlacement, [a, b, shared], positions), true);
    assert.equal(zipTieClearOfNotes(blockedPlacement, [a, b, shared], positions), false);
    assert.equal(slideZipTie(tie, edgeMap, positions, 3, { x:0, y:1000 }, undefined, [a, b, shared]), undefined);
});
test('moving a note out of the bundle removes its wire and shrinks the zip tie in place', () => {
	const [shared, a, b, c] = ['z', 'a', 'b', 'c'].map(id => summarizeNote(note(id)));
	const edges = [a, b, c].map(target => ({ source:shared, target }));
	const before = { z:{x:0,y:100}, a:{x:500,y:0}, b:{x:500,y:50}, c:{x:500,y:100} };
	const after = { ...before, c:{x:500,y:500} };
	const edgeMap = new Map(edges.map(edge => [graphEdgeKey(edge), edge]));
	const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
	const next = zipTiesAfterNodeMove([tie], edgeMap, before, after, 4, new Set(['c']));
	const originalPlacement = zipTiePlacement(tie, edgeMap, after, 4);
	const updatedPlacement = zipTiePlacement(next[0], edgeMap, after, 4);
	assert.equal(zipTiePlacement(tie, edgeMap, before, 4).width, 24);
	assert.equal(next.length, 1);
	assert.equal(next[0].members.length, 2);
	assert.equal(next[0].members.some(member => member.edgeKey === graphEdgeKey(edges[2])), false);
	assert.ok(next[0].members.every(member => member.t === .5));
	assert.equal(updatedPlacement.width, 18);
	assert.ok(Math.abs(updatedPlacement.x - originalPlacement.x) < 1);
	assert.equal(edges.length, 3);
});
test('a small note movement keeps its wire attached to the zip tie', () => {
	const [shared, a, b, c] = ['z', 'a', 'b', 'c'].map(id => summarizeNote(note(id)));
	const edges = [a, b, c].map(target => ({ source:shared, target }));
	const before = { z:{x:0,y:100}, a:{x:500,y:0}, b:{x:500,y:50}, c:{x:500,y:100} };
	const after = { ...before, c:{x:500,y:140} };
	const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
	const next = zipTiesAfterNodeMove([tie], new Map(edges.map(edge => [graphEdgeKey(edge), edge])), before, after, 4, new Set(['c']));
	assert.equal(next[0].members.length, 3);
});
test('a wire stays tied through a substantial move before it diverges from the bundle', () => {
	const [shared, a, b, c] = ['z', 'a', 'b', 'c'].map(id => summarizeNote(note(id)));
	const edges = [a, b, c].map(target => ({ source:shared, target }));
	const before = { z:{x:0,y:100}, a:{x:500,y:0}, b:{x:500,y:50}, c:{x:500,y:100} };
	const after = { ...before, c:{x:500,y:460} };
	const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
	const next = zipTiesAfterNodeMove([tie], new Map(edges.map(edge => [graphEdgeKey(edge), edge])), before, after, 4, new Set(['c']));
	assert.equal(next[0].members.length, 3);
});
test('moving a shared note does not detach wires that move together', () => {
	const [shared, a, b, c] = ['z', 'a', 'b', 'c'].map(id => summarizeNote(note(id)));
	const edges = [a, b, c].map(target => ({ source:shared, target }));
	const before = { z:{x:0,y:100}, a:{x:500,y:0}, b:{x:500,y:50}, c:{x:500,y:100} };
	const after = { ...before, z:{x:100,y:100} };
	const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
	const next = zipTiesAfterNodeMove([tie], new Map(edges.map(edge => [graphEdgeKey(edge), edge])), before, after, 4, new Set(['z']));
	assert.equal(next[0].members.length, 3);
});
test('nearest graph edge point returns the curve location and parameter', () => {
    const edge = { source:summarizeNote(note('a')), target:summarizeNote(note('b')) };
    const positions = { a:{x:0,y:0}, b:{x:400,y:0} };
    const midpointX = (positions.a.x + positions.b.x) / 2 + 21;
    const nearest = nearestGraphEdgePoint(edge, positions, 2, { x:midpointX, y:17 });
    assert.ok(Math.abs(nearest.t - .5) < .03);
    assert.ok(nearest.distance < 1);
});
test('drawing a cross-stroke finds each nearby wire once and ignores parallel strokes', () => {
    const notes = ['a', 'b', 'c', 'd'].map(id => summarizeNote(note(id)));
    const edges = [{ source:notes[0], target:notes[1] }, { source:notes[2], target:notes[3] }];
    const positions = { a:{x:0,y:0}, b:{x:500,y:0}, c:{x:0,y:8}, d:{x:500,y:8} };
    const midX = 271;
    const crossed = graphEdgesCrossedByStroke(edges, positions, 4, {x:midX,y:-40}, {x:midX,y:45}, 12);
    assert.equal(crossed.length, 2);
    assert.ok(crossed.every(member => Math.abs(member.t - .5) < .03));
    assert.deepEqual(graphEdgesCrossedByStroke(edges, positions, 4, {x:0,y:0}, {x:500,y:0}, 12), []);
});
test('a horizontal stroke can tie widely fanned wires together', () => {
    const [a, b, shared] = ['a', 'b', 'z'].map(id => summarizeNote(note(id)));
    const edges = [{ source:a, target:shared }, { source:b, target:shared }];
    const positions = { a:{x:0,y:0}, b:{x:500,y:0}, z:{x:250,y:400} };
    const stroke = graphEdgesCrossedByStroke(edges, positions, 3, {x:50,y:217}, {x:600,y:217}, 12);
    assert.equal(stroke.length, 2);
    const tie = { id:'tie', members:stroke };
    const edgeMap = new Map(edges.map(edge => [graphEdgeKey(edge), edge]));
    const placement = zipTiePlacement(tie, edgeMap, positions, 3);
    assert.ok(placement);
    assert.equal(placement.width, 18);
    const routed = routeGraphEdges(edges, positions, 3, [tie]);
    for (const member of stroke) {
        const edge = edgeMap.get(member.edgeKey);
        const path = graphEdgePath(edge, positions, 3, routed.routesByKey.get(member.edgeKey));
        const original = graphEdgePath(edge, positions, 3);
        const point = graphEdgePointAt(edge, positions, 3, member.t, routed.routesByKey.get(member.edgeKey));
        assert.notEqual(path, original);
        assert.equal((path.match(/ C /g) ?? []).length, 2);
        assert.ok(Math.hypot(point.x - placement.x, point.y - placement.y) < 4);
    }
});
test('additional ties can be drawn on the routed bundle and keep the section between them together', () => {
    const [a, b, shared] = ['a', 'b', 'z'].map(id => summarizeNote(note(id)));
    const edges = [{ source:a, target:shared }, { source:b, target:shared }];
    const positions = { a:{x:0,y:0}, b:{x:500,y:0}, z:{x:250,y:400} };
    const first = { id:'first', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.4 })) };
    const firstRoute = routeGraphEdges(edges, positions, 3, [first]);
    const points = edges.map(edge => graphEdgePointAt(edge, positions, 3, .75, firstRoute.routesByKey.get(graphEdgeKey(edge))));
    const y = points.reduce((sum, point) => sum + point.y / points.length, 0);
    const stroke = graphEdgesCrossedByStroke(edges, positions, 3, {x:50,y}, {x:600,y}, 12, firstRoute.routesByKey);
    assert.equal(stroke.length, 2);
    const second = { id:'second', members:stroke };
    const routes = routeGraphEdges(edges, positions, 3, [first, second]);
    const [firstEdge, secondEdge] = edges;
    for (const edge of edges) assert.equal((graphEdgePath(edge, positions, 3, routes.routesByKey.get(graphEdgeKey(edge))).match(/ C /g) ?? []).length, 3);
    const firstEnd = second.members.find(member => member.edgeKey === graphEdgeKey(firstEdge)).t;
    const secondEnd = second.members.find(member => member.edgeKey === graphEdgeKey(secondEdge)).t;
    for (const progress of [.2, .4, .6, .8]) {
        const firstPoint = graphEdgePointAt(firstEdge, positions, 3, .4 + (firstEnd - .4) * progress, routes.routesByKey.get(graphEdgeKey(firstEdge)));
        const secondPoint = graphEdgePointAt(secondEdge, positions, 3, .4 + (secondEnd - .4) * progress, routes.routesByKey.get(graphEdgeKey(secondEdge)));
        assert.ok(Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y) < 7);
    }
    assert.equal(routes.zipTies.length, 2);
});
test('a zip tie slides along each of its wires while remaining bound to those wires', () => {
    const notes = ['a', 'b', 'c', 'd'].map(id => summarizeNote(note(id)));
    const edges = [{ source:notes[0], target:notes[1] }, { source:notes[2], target:notes[3] }];
    const positions = { a:{x:0,y:0}, b:{x:500,y:0}, c:{x:0,y:8}, d:{x:500,y:8} };
    const edgeMap = new Map(edges.map(edge => [graphEdgeKey(edge), edge]));
    const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
    const moved = slideZipTie(tie, edgeMap, positions, 4, { x:60, y:0 });
    assert.ok(moved);
    assert.ok(moved.members.every(member => member.t > .5));
    assert.ok(zipTiePlacement(moved, edgeMap, positions, 4));
});
for (const scale of [0, -1, null, '1', 10]) test('stored camera rejects invalid scale: ' + scale, t => {
    const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
    globalThis.window = {}; globalThis.localStorage = { getItem: () => JSON.stringify({ positions: {}, view: { x: 0, y: 0, scale } }) };
    t.after(() => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
        if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage; });
    assert.equal(readGraphState("vault-a").view, undefined);
});
test('code mapping preserves fences and transforms only prose', () => {
    const content = 'hi `code`\n~~~js\nprotected\n~~~~\nbye';
    assert.equal(mapTextOutsideCode(content, text => text.toUpperCase()), 'HI `code`\n~~~js\nprotected\n~~~~\nBYE');
});
test('history discards forward branch and skips deleted notes', () => {
    let history = createNavigationHistory();
    for (const noteId of ['a', 'b', 'c']) history = recordNavigation(history, { route: 'note', noteId });
    assert.equal(findHistoryIndex(history, -1, new Set(['a', 'c'])), 0);
    history = recordNavigation({ ...history, index: 0 }, { route: 'note', noteId: 'd' });
    assert.deepEqual(history.entries.map(entry => entry.noteId), ['a', 'd']);
});
test('history caps entries and ignores repeated destination', () => {
    let history = createNavigationHistory();
    for (let i = 0; i < 250; i++) history = recordNavigation(history, { route: 'note', noteId: String(i) });
    assert.equal(history.entries.length, 200); assert.equal(history.entries[0].noteId, '50');
    assert.equal(recordNavigation(history, { route: 'note', noteId: '249' }), history);
});
for (const fence of ['```', '~~~']) test('unclosed code fence protects the remaining text: ' + fence, () => {
    assert.equal(mapTextOutsideCode('before\n' + fence + '\ntext', value => value.toUpperCase()), 'BEFORE\n' + fence + '\ntext');
});
test('a different fence marker does not close a code block', () => {
    const value = '~~~\n```\n[[b]]\n~~~\n[[b]]';
    assert.equal(mapTextOutsideCode(value, prose => prose.replaceAll('[[b]]', 'LINK')), '~~~\n```\n[[b]]\n~~~\nLINK');
});
