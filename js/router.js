// ============ 自动布线算法（曼哈顿路径 + 智能避障） ============

function getObstacles(excludeComps) {
    const obstacles = [];
    const PADDING = 25;
    State.components.forEach(c => {
        if (excludeComps.includes(c)) return;
        obstacles.push({
            x: c.x - PADDING,
            y: c.y - PADDING,
            w: c.typeDef.width + PADDING * 2,
            h: c.typeDef.height + PADDING * 2,
            comp: c
        });
    });
    return obstacles;
}

function lineIntersectsRect(x1, y1, x2, y2, r) {
    if (x1 === x2) {
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        return x1 > r.x && x1 < r.x + r.w && maxY > r.y && minY < r.y + r.h;
    } else {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        return y1 > r.y && y1 < r.y + r.h && maxX > r.x && minX < r.x + r.w;
    }
}

function pointInRect(x, y, r) {
    return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
}

function calculateCollisionCost(waypoints, obstacles) {
    let cost = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i], b = waypoints[i + 1];
        for (const r of obstacles) {
            if (lineIntersectsRect(a.x, a.y, b.x, b.y, r)) {
                cost += 1000;
            }
        }
        const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        cost += segLen * 0.1;
    }
    cost += waypoints.length * 5;
    return cost;
}

function hasAnyCollision(waypoints, obstacles, options = {}) {
    const skipFirst = options.skipFirst || 0;
    const skipLast = options.skipLast || 0;
    const startIdx = skipFirst;
    const endIdx = waypoints.length - 1 - skipLast;

    for (let i = startIdx; i < endIdx; i++) {
        const a = waypoints[i], b = waypoints[i + 1];
        for (const r of obstacles) {
            if (lineIntersectsRect(a.x, a.y, b.x, b.y, r)) {
                return true;
            }
        }
    }
    return false;
}

function lineCrossesRect(x1, y1, x2, y2, r) {
    const p1In = pointInRect(x1, y1, r);
    const p2In = pointInRect(x2, y2, r);
    if (p1In && p2In) return true;
    if (!p1In && !p2In) return lineIntersectsRect(x1, y1, x2, y2, r);
    return false;
}

function generateGridRoutes(from, to, obstacles) {
    const routes = [];
    const margins = [15, 30, 50, 80, 120, 180, 250];

    function addOffsetRoutes(margin) {
        const fromLeft = from.x - margin;
        const fromRight = from.x + margin;
        const fromUp = from.y - margin;
        const fromDown = from.y + margin;

        const toLeft = to.x - margin;
        const toRight = to.x + margin;
        const toUp = to.y - margin;
        const toDown = to.y + margin;

        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        routes.push([from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]);
        routes.push([from, { x: from.x, y: midY }, { x: to.x, y: midY }, to]);

        routes.push([from, { x: fromRight, y: from.y }, { x: fromRight, y: midY }, { x: toLeft, y: midY }, { x: toLeft, y: to.y }, to]);
        routes.push([from, { x: fromLeft, y: from.y }, { x: fromLeft, y: midY }, { x: toRight, y: midY }, { x: toRight, y: to.y }, to]);

        routes.push([from, { x: fromRight, y: from.y }, { x: fromRight, y: fromUp }, { x: toRight, y: fromUp }, { x: toRight, y: to.y }, to]);
        routes.push([from, { x: fromRight, y: from.y }, { x: fromRight, y: fromDown }, { x: toRight, y: fromDown }, { x: toRight, y: to.y }, to]);

        routes.push([from, { x: from.x, y: fromUp }, { x: midX, y: fromUp }, { x: midX, y: toUp }, { x: to.x, y: toUp }, to]);
        routes.push([from, { x: from.x, y: fromDown }, { x: midX, y: fromDown }, { x: midX, y: toDown }, { x: to.x, y: toDown }, to]);

        routes.push([from, { x: from.x, y: fromUp }, { x: to.x, y: fromUp }, to]);
        routes.push([from, { x: from.x, y: fromDown }, { x: to.x, y: fromDown }, to]);
        routes.push([from, { x: fromRight, y: from.y }, { x: fromRight, y: to.y }, to]);
        routes.push([from, { x: toLeft, y: from.y }, { x: toLeft, y: to.y }, to]);

        const minX = Math.min(from.x, to.x) - margin * 2;
        const maxX = Math.max(from.x, to.x) + margin * 2;
        const minY = Math.min(from.y, to.y) - margin * 2;
        const maxY = Math.max(from.y, to.y) + margin * 2;

        routes.push([from, { x: minX, y: from.y }, { x: minX, y: to.y }, to]);
        routes.push([from, { x: maxX, y: from.y }, { x: maxX, y: to.y }, to]);
        routes.push([from, { x: from.x, y: minY }, { x: to.x, y: minY }, to]);
        routes.push([from, { x: from.x, y: maxY }, { x: to.x, y: maxY }, to]);

        routes.push([from, { x: minX, y: from.y }, { x: minX, y: midY }, { x: to.x, y: midY }, to]);
        routes.push([from, { x: maxX, y: from.y }, { x: maxX, y: midY }, { x: to.x, y: midY }, to]);
        routes.push([from, { x: from.x, y: minY }, { x: midX, y: minY }, { x: midX, y: to.y }, to]);
        routes.push([from, { x: from.x, y: maxY }, { x: midX, y: maxY }, { x: midX, y: to.y }, to]);
    }

    margins.forEach(m => addOffsetRoutes(m));

    const xGrid = [];
    const yGrid = [];
    margins.forEach(m => {
        xGrid.push(from.x - m, from.x + m, to.x - m, to.x + m);
        yGrid.push(from.y - m, from.y + m, to.y - m, to.y + m);
    });
    xGrid.push((from.x + to.x) / 2);
    yGrid.push((from.y + to.y) / 2);

    for (const gx of xGrid) {
        if (gx < 0) continue;
        for (const gy of yGrid) {
            if (gy < 0) continue;
            routes.push([from, { x: gx, y: from.y }, { x: gx, y: gy }, { x: to.x, y: gy }, to]);
            routes.push([from, { x: from.x, y: gy }, { x: gx, y: gy }, { x: gx, y: to.y }, to]);
        }
    }

    return routes;
}

function routeWire(from, to, excludeComps) {
    const obstacles = getObstacles(excludeComps);

    function buildPath(waypoints) {
        let d = `M ${waypoints[0].x} ${waypoints[0].y}`;
        for (let i = 1; i < waypoints.length; i++) {
            d += ` L ${waypoints[i].x} ${waypoints[i].y}`;
        }
        return d;
    }

    const allRoutes = generateGridRoutes(from, to, obstacles);

    let bestRoute = null;
    let bestCost = Infinity;

    for (const route of allRoutes) {
        const collision = hasAnyCollision(route, obstacles);
        if (!collision) {
            const cost = calculateCollisionCost(route, []);
            if (cost < bestCost) {
                bestCost = cost;
                bestRoute = route;
            }
        }
    }

    if (bestRoute) {
        return buildPath(bestRoute);
    }

    if (obstacles.length > 0) {
        const outerRoutes = buildOuterRoutes(from, to, obstacles);
        for (const route of outerRoutes) {
            const collision = hasAnyCollision(route, obstacles, { skipFirst: 1, skipLast: 1 });
            if (!collision) {
                const cost = calculateCollisionCost(route, []);
                if (cost < bestCost) {
                    bestCost = cost;
                    bestRoute = route;
                }
            }
        }
        if (bestRoute) {
            return buildPath(bestRoute);
        }
    }

    let fallbackRoute = null;
    let fallbackCost = Infinity;
    for (const route of allRoutes) {
        const cost = calculateCollisionCost(route, obstacles);
        if (cost < fallbackCost) {
            fallbackCost = cost;
            fallbackRoute = route;
        }
    }

    if (fallbackRoute) {
        const safeRoute = makeRouteSafe(fallbackRoute, obstacles, from, to);
        return buildPath(safeRoute);
    }

    return buildPath(allRoutes[0]);
}

function buildOuterRoutes(from, to, obstacles) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const r of obstacles) {
        minX = Math.min(minX, r.x);
        maxX = Math.max(maxX, r.x + r.w);
        minY = Math.min(minY, r.y);
        maxY = Math.max(maxY, r.y + r.h);
    }
    const margin = 40;
    minX -= margin;
    maxX += margin;
    minY -= margin;
    maxY += margin;

    const routes = [];

    routes.push([from, { x: from.x, y: minY }, { x: to.x, y: minY }, to]);
    routes.push([from, { x: from.x, y: maxY }, { x: to.x, y: maxY }, to]);
    routes.push([from, { x: minX, y: from.y }, { x: minX, y: to.y }, to]);
    routes.push([from, { x: maxX, y: from.y }, { x: maxX, y: to.y }, to]);

    routes.push([from, { x: from.x, y: minY }, { x: maxX, y: minY }, { x: maxX, y: to.y }, to]);
    routes.push([from, { x: from.x, y: maxY }, { x: maxX, y: maxY }, { x: maxX, y: to.y }, to]);
    routes.push([from, { x: from.x, y: minY }, { x: minX, y: minY }, { x: minX, y: to.y }, to]);
    routes.push([from, { x: from.x, y: maxY }, { x: minX, y: maxY }, { x: minX, y: to.y }, to]);

    routes.push([from, { x: minX, y: from.y }, { x: minX, y: minY }, { x: to.x, y: minY }, to]);
    routes.push([from, { x: minX, y: from.y }, { x: minX, y: maxY }, { x: to.x, y: maxY }, to]);
    routes.push([from, { x: maxX, y: from.y }, { x: maxX, y: minY }, { x: to.x, y: minY }, to]);
    routes.push([from, { x: maxX, y: from.y }, { x: maxX, y: maxY }, { x: to.x, y: maxY }, to]);

    return routes;
}

function makeRouteSafe(route, obstacles, from, to) {
    const result = [from];
    for (let i = 1; i < route.length; i++) {
        const prev = result[result.length - 1];
        const curr = route[i];
        let hit = null;
        let hitT = Infinity;

        for (const r of obstacles) {
            const t = lineRectEntryPoint(prev.x, prev.y, curr.x, curr.y, r);
            if (t !== null && t < hitT) {
                hitT = t;
                hit = r;
            }
        }

        if (!hit) {
            result.push(curr);
        } else {
            const r = hit;
            const entryX = prev.x + (curr.x - prev.x) * hitT;
            const entryY = prev.y + (curr.y - prev.y) * hitT;

            const upOut = r.y - 15;
            const downOut = r.y + r.h + 15;
            const leftOut = r.x - 15;
            const rightOut = r.x + r.w + 15;

            const distUp = Math.abs(entryY - upOut);
            const distDown = Math.abs(entryY - downOut);
            const distLeft = Math.abs(entryX - leftOut);
            const distRight = Math.abs(entryX - rightOut);

            const minDist = Math.min(distUp, distDown, distLeft, distRight);

            let detourX, detourY;
            if (minDist === distUp) {
                detourX = entryX;
                detourY = upOut;
            } else if (minDist === distDown) {
                detourX = entryX;
                detourY = downOut;
            } else if (minDist === distLeft) {
                detourX = leftOut;
                detourY = entryY;
            } else {
                detourX = rightOut;
                detourY = entryY;
            }

            const nearEnd = (i === route.length - 1);
            if (nearEnd) {
                if (minDist === distUp || minDist === distDown) {
                    result.push({ x: detourX, y: detourY });
                    result.push({ x: to.x, y: detourY });
                    result.push(to);
                } else {
                    result.push({ x: detourX, y: detourY });
                    result.push({ x: detourX, y: to.y });
                    result.push(to);
                }
            } else {
                result.push({ x: detourX, y: detourY });
                if (curr.y !== detourY) {
                    result.push({ x: curr.x, y: detourY });
                }
                result.push(curr);
            }
        }
    }

    return result;
}

function lineRectEntryPoint(x1, y1, x2, y2, r) {
    if (x1 === x2) {
        if (x1 <= r.x || x1 >= r.x + r.w) return null;
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        if (maxY <= r.y || minY >= r.y + r.h) return null;
        const entryY = y1 < y2 ? r.y : r.y + r.h;
        const t = Math.abs(entryY - y1) / Math.abs(y2 - y1 || 1);
        return t;
    } else {
        if (y1 <= r.y || y1 >= r.y + r.h) return null;
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        if (maxX <= r.x || minX >= r.x + r.w) return null;
        const entryX = x1 < x2 ? r.x : r.x + r.w;
        const t = Math.abs(entryX - x1) / Math.abs(x2 - x1 || 1);
        return t;
    }
}
