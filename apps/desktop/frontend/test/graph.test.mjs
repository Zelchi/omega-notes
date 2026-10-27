import test from 'node:test';
import assert from 'node:assert/strict';
import { graphEdgeKey, graphEdgePath, graphEdges, graphEdgesCrossedByStroke, graphEdgePointAt, nearestGraphEdgePoint, nodeSize, routeGraphEdges, slideZipTie, zipTiesAfterNodeMove, zipTieClearOfNotes, zipTiePlacement } from '../src/pages/canvas/lib/graph.ts';
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
test('wires attach to the nearest side of both notes', () => {
    const source = summarizeNote(note('source'));
    const target = summarizeNote(note('target'));
    const sourceSize = nodeSize(source), targetSize = nodeSize(target);
    const sourceCenter = { x:sourceSize.width / 2, y:sourceSize.height / 2 };
    for (const [name, delta, startSide, endSide] of [
        ['right', { x:500, y:0 }, 'right', 'left'],
        ['left', { x:-500, y:0 }, 'left', 'right'],
        ['bottom', { x:0, y:300 }, 'bottom', 'top'],
        ['top', { x:0, y:-300 }, 'top', 'bottom'],
    ]) {
        const targetCenter = { x:sourceCenter.x + delta.x, y:sourceCenter.y + delta.y };
        const positions = {
            source:{ x:0, y:0 },
            target:{ x:targetCenter.x - targetSize.width / 2, y:targetCenter.y - targetSize.height / 2 },
        };
        const edge = { source, target };
        const start = graphEdgePointAt(edge, positions, 2, 0);
        const end = graphEdgePointAt(edge, positions, 2, 1);
        const expected = (position, size, side) => ({
            right:{ x:position.x + size.width, y:position.y + size.height / 2 },
            left:{ x:position.x, y:position.y + size.height / 2 },
            bottom:{ x:position.x + size.width / 2, y:position.y + size.height },
            top:{ x:position.x + size.width / 2, y:position.y },
        })[side];
        assert.deepEqual(start, expected(positions.source, sourceSize, startSide), name + ' source side');
        assert.deepEqual(end, expected(positions.target, targetSize, endSide), name + ' target side');
    }
});
test('a horizontal route leaves a wide note on its right edge even when the destination is lower', () => {
	const source = { ...summarizeNote(note('source')), title:'Diagrama de Componentes' };
	const target = summarizeNote(note('target'));
	const sourceSize = nodeSize(source), targetSize = nodeSize(target);
	const sourceCenter = { x:sourceSize.width / 2, y:sourceSize.height / 2 };
	const targetCenter = { x:sourceCenter.x + 240, y:sourceCenter.y + 70 };
	const positions = {
		source:{x:0,y:0},
		target:{x:targetCenter.x - targetSize.width / 2, y:targetCenter.y - targetSize.height / 2},
	};
	const edge = { source, target };
	const start = graphEdgePointAt(edge, positions, 2, 0);
	assert.equal(start.x, sourceSize.width);
});
test('note ports face the nearest zip tie instead of a lower remote note', () => {
	const source = { ...summarizeNote(note('component')), title:'Diagrama de Componentes' };
	const targets = ['target1', 'target2'].map(id => summarizeNote(note(id)));
	const edges = targets.map(target => ({ source, target }));
	const sourceSize = nodeSize(source);
	const positions = { component:{x:0,y:0} };
	for (const [index, [dx, dy]] of [[175, 200], [190, 210]].entries()) {
		const targetSize = nodeSize(targets[index]);
		positions[targets[index].id] = {
			x:sourceSize.width / 2 + dx - targetSize.width / 2,
			y:17 + dy - targetSize.height / 2,
		};
	}
	const baseline = routeGraphEdges(edges, positions, 3, []).routesByKey;
	assert.ok(edges.every(edge => graphEdgePointAt(edge, positions, 3, 0, baseline.get(graphEdgeKey(edge))).y === sourceSize.height));
	const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.7 })) };
	const routes = routeGraphEdges(edges, positions, 3, [tie]).routesByKey;
	for (const edge of edges) {
		const start = graphEdgePointAt(edge, positions, 3, 0, routes.get(graphEdgeKey(edge)));
		assert.equal(start.x, sourceSize.width);
	}
});
test('wires spread along shared note edges and keep their geometric order', () => {
	const [hub, upper, lower] = ['hub', 'upper', 'lower'].map(id => summarizeNote(note(id)));
	const positions = { hub:{x:0,y:100}, upper:{x:500,y:80}, lower:{x:500,y:120} };
	const checkPorts = (edges, noteId, endpoint) => {
		const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
		const routes = routeGraphEdges(edges, positions, 3, [tie]).routesByKey;
		const atPort = edge => graphEdgePointAt(edge, positions, 3, endpoint === 'start' ? 0 : 1, routes.get(graphEdgeKey(edge)));
		const upperPort = atPort(edges.find(edge => edge.source.id === 'upper' || edge.target.id === 'upper'));
		const lowerPort = atPort(edges.find(edge => edge.source.id === 'lower' || edge.target.id === 'lower'));
		assert.ok(lowerPort.y > upperPort.y, `${noteId} ports follow the notes' vertical order`);
		assert.ok(Math.abs(lowerPort.y - upperPort.y - 6) < 1e-6);
		for (const t of endpoint === 'start' ? [0, .2, .4, .5] : [.5, .6, .8, 1]) {
			const upperEdge = edges.find(edge => edge.source.id === 'upper' || edge.target.id === 'upper');
			const lowerEdge = edges.find(edge => edge.source.id === 'lower' || edge.target.id === 'lower');
			assert.ok(graphEdgePointAt(lowerEdge, positions, 3, t, routes.get(graphEdgeKey(lowerEdge))).y > graphEdgePointAt(upperEdge, positions, 3, t, routes.get(graphEdgeKey(upperEdge))).y, `${noteId} keeps the order at t=${t}`);
		}
	};
	checkPorts([{ source:hub, target:upper }, { source:hub, target:lower }], 'hub output', 'start');
	checkPorts([{ source:upper, target:hub }, { source:lower, target:hub }], 'hub input', 'end');
});
test('many wires compress along a note edge without extending beyond its height', () => {
	const source = summarizeNote(note('hub'));
	const targets = Array.from({ length:20 }, (_, index) => summarizeNote(note(`target-${index}`)));
	const edges = targets.map(target => ({ source, target }));
	const positions = { hub:{x:0,y:100} };
	targets.forEach((target, index) => { positions[target.id] = { x:500, y:50 + index * 3 }; });
	const routes = routeGraphEdges(edges, positions, edges.length + 1, []).routesByKey;
	const points = edges.map(edge => graphEdgePointAt(edge, positions, edges.length + 1, 0, routes.get(graphEdgeKey(edge))));
	const spacing = nodeSize(source).height / (edges.length + 1);

	assert.ok(points.every(point => point.y >= positions.hub.y && point.y <= positions.hub.y + nodeSize(source).height));
	assert.ok(points.every((point, index) => index === 0 || Math.abs(point.y - points[index - 1].y - spacing) < 1e-6));
	assert.ok(spacing < 6);
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
    const nearNote = { ...tie, members:tie.members.map(member => ({ ...member, t:.99 })) };
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
    const routed = routeGraphEdges(edges, positions, 3, [tie]);
    const placement = routed.zipTies[0].placement;
    assert.ok(placement);
    assert.equal(placement.width, 18);
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
    const assertForward = (edge, startT, endT) => {
        const pointAt = t => graphEdgePointAt(edge, positions, 3, t, routes.routesByKey.get(graphEdgeKey(edge)));
        const start = pointAt(startT), end = pointAt(endT);
        const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
        let previous = 0;
        for (let index = 1; index <= 32; index++) {
            const point = pointAt(startT + (endT - startT) * index / 32);
            const progress = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
            assert.ok(progress >= previous - 1e-6 && progress <= 1 + 1e-6, `wire does not double back between t=${startT} and t=${endT}`);
            previous = progress;
        }
    };
    for (const edge of edges) {
        const endT = second.members.find(member => member.edgeKey === graphEdgeKey(edge)).t;
        assertForward(edge, 0, .4);
        assertForward(edge, .4, endT);
        assertForward(edge, endT, 1);
    }
    for (const progress of [.2, .4, .6, .8]) {
        const firstPoint = graphEdgePointAt(firstEdge, positions, 3, .4 + (firstEnd - .4) * progress, routes.routesByKey.get(graphEdgeKey(firstEdge)));
        const secondPoint = graphEdgePointAt(secondEdge, positions, 3, .4 + (secondEnd - .4) * progress, routes.routesByKey.get(graphEdgeKey(secondEdge)));
        assert.ok(Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y) < 7);
    }
    assert.equal(routes.zipTies.length, 2);
});
test('zip-tie slots follow note height and preserve their order across ties', () => {
	const [upper, shared, lower] = ['z-upper', 'm-shared', 'a-lower'].map(id => summarizeNote(note(id)));
	const edges = [{ source:lower, target:shared }, { source:upper, target:shared }];
	const positions = { 'z-upper':{x:0,y:0}, 'a-lower':{x:0,y:180}, 'm-shared':{x:700,y:80} };
    const members = edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.35 }));
    const first = { id:'first', members };
    const second = { id:'second', members:members.map(member => ({ ...member, t:.7 })) };
    const routes = routeGraphEdges(edges, positions, 3, [first, second]);
    const lowerEdge = edges[0], upperEdge = edges[1];
    const pointAt = (edge, t) => graphEdgePointAt(edge, positions, 3, t, routes.routesByKey.get(graphEdgeKey(edge)));
    for (const t of [.35, .42, .5, .6, .7]) {
        assert.ok(pointAt(lowerEdge, t).y > pointAt(upperEdge, t).y, `lower wire remains below upper wire at t=${t}`);
    }
});
test('zip-tie routing keeps each wire moving in its own direction', () => {
	const [left, right, otherRight, otherLeft] = ['a-left', 'z-right', 'b-right', 'y-left'].map(id => summarizeNote(note(id)));
	const edges = [{ source:left, target:right }, { source:otherRight, target:otherLeft }];
	const positions = { 'a-left':{x:0,y:0}, 'z-right':{x:500,y:0}, 'b-right':{x:500,y:60}, 'y-left':{x:0,y:60} };
	const tie = { id:'tie', members:edges.map(edge => ({ edgeKey:graphEdgeKey(edge), t:.5 })) };
	const routes = routeGraphEdges(edges, positions, 4, [tie]);
	for (const edge of edges) {
		const pointAt = t => graphEdgePointAt(edge, positions, 4, t, routes.routesByKey.get(graphEdgeKey(edge)));
		const before = pointAt(.49), anchor = pointAt(.5), after = pointAt(.51);
		assert.ok((anchor.x - before.x) * (after.x - anchor.x) + (anchor.y - before.y) * (after.y - anchor.y) > 0);
	}
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
