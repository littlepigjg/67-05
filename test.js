// ============ 测试框架 ============
const TestResults = {
    total: 0,
    pass: 0,
    fail: 0,
    groups: {}
};

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || '断言失败');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || '断言失败'}: 期望 ${expected}, 实际 ${actual}`);
    }
}

function runGroup(groupName, testFns) {
    TestResults.groups[groupName] = [];
    for (const test of testFns) {
        TestResults.total++;
        try {
            test.fn();
            TestResults.pass++;
            TestResults.groups[groupName].push({ name: test.name, pass: true });
        } catch (e) {
            TestResults.fail++;
            TestResults.groups[groupName].push({ name: test.name, pass: false, error: e.message });
            console.error(`测试失败: ${test.name}`, e);
        }
    }
}

// ============ 测试工具函数 ============
function resetState() {
    State.components = [];
    State.wires = [];
    State.nextId = 1;
    State.switchCounter = 1;
    State.bulbCounter = 1;
    State.gateCounter = 1;
    State.moduleCounter = 1;
    State.selectedComponent = null;
    State.connectingFrom = null;
    State.tempWireEnd = null;
    State.isSimulating = false;
}

function parsePathPoints(d) {
    const parts = d.split(/[ML]\s*/).filter(Boolean);
    return parts.map(p => {
        const [x, y] = p.trim().split(/\s+/).map(Number);
        return { x, y };
    });
}

function pathIntersectsRect(d, rect) {
    const points = parsePathPoints(d);
    for (let i = 0; i < points.length - 1; i++) {
        if (lineIntersectsRect(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, rect)) {
            return true;
        }
    }
    return false;
}

// ============ 测试用例定义 ============
const testSuites = [

    {
        name: '1. 连线避障算法',
        tests: [
            {
                name: '基础路径生成 - 从左到右的路径包含起点和终点',
                fn: () => {
                    resetState();
                    const from = { x: 100, y: 100 };
                    const to = { x: 300, y: 200 };
                    const d = routeWire(from, to, []);
                    assert(d.startsWith('M '), '路径应以 M 开头');
                    assert(d.includes('L '), '路径应包含 L 线段');
                    const points = parsePathPoints(d);
                    assertEqual(points[0].x, 100, '起点x匹配');
                    assertEqual(points[0].y, 100, '起点y匹配');
                    assertEqual(points[points.length - 1].x, 300, '终点x匹配');
                    assertEqual(points[points.length - 1].y, 200, '终点y匹配');
                }
            },
            {
                name: '无障碍物时 - 路径使用短折线',
                fn: () => {
                    resetState();
                    const from = { x: 100, y: 100 };
                    const to = { x: 300, y: 200 };
                    const d = routeWire(from, to, []);
                    const points = parsePathPoints(d);
                    assert(points.length <= 5, '无障碍物时路径应不超过5个点');
                }
            },
            {
                name: '中间有障碍物时 - 路径不穿过障碍物',
                fn: () => {
                    resetState();
                    const obsRect = { x: 200 - 25, y: 120 - 25, w: 110 + 50, h: 80 + 50 };

                    State.components.push({
                        id: 'obs_1',
                        type: 'and',
                        x: 200,
                        y: 120,
                        typeDef: { width: 110, height: 80 }
                    });

                    const from = { x: 100, y: 150 };
                    const to = { x: 400, y: 160 };
                    const d = routeWire(from, to, []);

                    const intersects = pathIntersectsRect(d, obsRect);
                    assert(!intersects, '路径不应穿过障碍物');
                }
            },
            {
                name: '两个元件靠得很近时 - 连线仍能绕过',
                fn: () => {
                    resetState();

                    const compA = new CircuitComponent('and', 50, 100);
                    const compB = new CircuitComponent('and', 320, 100);
                    const compMid = new CircuitComponent('not', 190, 100);
                    State.components.push(compA, compB, compMid);

                    const from = compA.getPortPosition('output', 'out');
                    const to = compB.getPortPosition('input', 'a');
                    const d = routeWire(from, to, [compA, compB]);

                    const midRect = {
                        x: compMid.x - 5,
                        y: compMid.y - 5,
                        w: compMid.typeDef.width + 10,
                        h: compMid.typeDef.height + 10
                    };
                    const intersects = pathIntersectsRect(d, midRect);
                    assert(!intersects, '连线不应穿过中间的元件本体');
                }
            },
            {
                name: '元件上下堆叠时 - 连线从左右绕行',
                fn: () => {
                    resetState();

                    const comp1 = new CircuitComponent('bulb', 100, 50);
                    const comp2 = new CircuitComponent('bulb', 300, 200);
                    const blocker = new CircuitComponent('and', 180, 100);
                    State.components.push(comp1, comp2, blocker);

                    const from = comp1.getPortPosition('input', 'in');
                    const to = comp2.getPortPosition('input', 'in');
                    const d = routeWire(from, to, [comp1, comp2]);

                    const blockRect = {
                        x: blocker.x - 25,
                        y: blocker.y - 25,
                        w: blocker.typeDef.width + 50,
                        h: blocker.typeDef.height + 50
                    };
                    const intersects = pathIntersectsRect(d, blockRect);
                    assert(!intersects, '连线应绕过中间阻挡的元件');
                }
            },
            {
                name: 'generateGridRoutes - 生成至少20种路径方案',
                fn: () => {
                    const from = { x: 100, y: 100 };
                    const to = { x: 400, y: 300 };
                    const routes = generateGridRoutes(from, to, []);
                    assert(routes.length >= 20, `应生成至少20种路径，实际生成 ${routes.length} 种`);
                }
            }
        ]
    },

    {
        name: '2. 子电路仿真（无卡死）',
        tests: [
            {
                name: '子电路模块能正常计算输出',
                fn: () => {
                    resetState();

                    const sw1 = new CircuitComponent('switch', 50, 50);
                    const sw2 = new CircuitComponent('switch', 50, 150);
                    const and = new CircuitComponent('and', 200, 90);
                    const bulb = new CircuitComponent('bulb', 380, 100);

                    State.components.push(sw1, sw2, and, bulb);
                    State.wires.push(
                        { id: 'w1', fromComp: sw1.id, fromPort: 'out', toComp: and.id, toPort: 'a' },
                        { id: 'w2', fromComp: sw2.id, fromPort: 'out', toComp: and.id, toPort: 'b' },
                        { id: 'w3', fromComp: and.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' }
                    );

                    const moduleData = {
                        name: 'AND2',
                        inputs: [
                            { id: 'in0', label: 'A' },
                            { id: 'in1', label: 'B' }
                        ],
                        outputs: [
                            { id: 'out0', label: 'OUT' }
                        ],
                        inputMap: { in0: sw1.id, in1: sw2.id },
                        outputMap: { out0: bulb.id },
                        components: JSON.parse(JSON.stringify(State.components)),
                        wires: JSON.parse(JSON.stringify(State.wires))
                    };

                    moduleData.components.forEach(c => {
                        c.typeDef = ComponentTypes[c.type] || ComponentTypes.module;
                    });

                    const result1 = simulateModuleStepInternal(moduleData, { in0: 0, in1: 0 });
                    assertEqual(result1.out0, 0, '输入0,0 输出应为0');

                    const result2 = simulateModuleStepInternal(moduleData, { in0: 1, in1: 0 });
                    assertEqual(result2.out0, 0, '输入1,0 输出应为0');

                    const result3 = simulateModuleStepInternal(moduleData, { in0: 0, in1: 1 });
                    assertEqual(result3.out0, 0, '输入0,1 输出应为0');

                    const result4 = simulateModuleStepInternal(moduleData, { in0: 1, in1: 1 });
                    assertEqual(result4.out0, 1, '输入1,1 输出应为1');
                }
            },
            {
                name: '子电路仿真不会无限递归卡死（限时检测）',
                fn: () => {
                    resetState();

                    const sw1 = new CircuitComponent('switch', 50, 50);
                    const not1 = new CircuitComponent('not', 200, 50);
                    const bulb = new CircuitComponent('bulb', 380, 50);

                    const moduleData = {
                        name: 'NOT_mod',
                        inputs: [{ id: 'in0', label: 'IN' }],
                        outputs: [{ id: 'out0', label: 'OUT' }],
                        inputMap: { in0: sw1.id },
                        outputMap: { out0: bulb.id },
                        components: [
                            { ...sw1, typeDef: ComponentTypes.switch },
                            { ...not1, typeDef: ComponentTypes.not },
                            { ...bulb, typeDef: ComponentTypes.bulb }
                        ],
                        wires: [
                            { id: 'w1', fromComp: sw1.id, fromPort: 'out', toComp: not1.id, toPort: 'in' },
                            { id: 'w2', fromComp: not1.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' }
                        ]
                    };

                    const startTime = Date.now();
                    const result = simulateModuleStepInternal(moduleData, { in0: 1 });
                    const elapsed = Date.now() - startTime;

                    assert(elapsed < 500, `子电路仿真耗时过长 (${elapsed}ms)，可能卡死`);
                    assertEqual(result.out0, 0, '非门输入1时输出应为0');
                }
            },
            {
                name: 'CircuitComponent._calculateModule 正确调用',
                fn: () => {
                    resetState();

                    const sw1 = new CircuitComponent('switch', 50, 50);
                    const sw2 = new CircuitComponent('switch', 50, 150);
                    const and = new CircuitComponent('and', 200, 90);
                    const bulb = new CircuitComponent('bulb', 380, 100);

                    const moduleData = {
                        name: 'AND_gate',
                        inputs: [
                            { id: 'in0', label: 'A' },
                            { id: 'in1', label: 'B' }
                        ],
                        outputs: [{ id: 'out0', label: 'OUT' }],
                        inputMap: { in0: sw1.id, in1: sw2.id },
                        outputMap: { out0: bulb.id },
                        components: [
                            { ...sw1, typeDef: JSON.parse(JSON.stringify(ComponentTypes.switch)) },
                            { ...sw2, typeDef: JSON.parse(JSON.stringify(ComponentTypes.switch)) },
                            { ...and, typeDef: JSON.parse(JSON.stringify(ComponentTypes.and)) },
                            { ...bulb, typeDef: JSON.parse(JSON.stringify(ComponentTypes.bulb)) }
                        ],
                        wires: [
                            { id: 'w1', fromComp: sw1.id, fromPort: 'out', toComp: and.id, toPort: 'a' },
                            { id: 'w2', fromComp: sw2.id, fromPort: 'out', toComp: and.id, toPort: 'b' },
                            { id: 'w3', fromComp: and.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' }
                        ]
                    };

                    const mod = new CircuitComponent('module', 100, 100,
                        JSON.parse(JSON.stringify(moduleData)));

                    mod.inputValues.in0 = 1;
                    mod.inputValues.in1 = 1;
                    mod.calculateOutputs();
                    assertEqual(mod.outputValues.out0, 1, '子电路输入全1时输出应为1');

                    mod.inputValues.in0 = 0;
                    mod.inputValues.in1 = 1;
                    mod.calculateOutputs();
                    assertEqual(mod.outputValues.out0, 0, '子电路输入0和1时输出应为0');
                }
            },
            {
                name: '子电路模块拖入后状态不受外部仿真影响',
                fn: () => {
                    resetState();

                    const sw = new CircuitComponent('switch', 50, 50);
                    const bulb = new CircuitComponent('bulb', 200, 50);
                    const moduleData = {
                        name: 'BUF',
                        inputs: [{ id: 'in0', label: 'IN' }],
                        outputs: [{ id: 'out0', label: 'OUT' }],
                        inputMap: { in0: sw.id },
                        outputMap: { out0: bulb.id },
                        components: [
                            { ...sw, typeDef: JSON.parse(JSON.stringify(ComponentTypes.switch)) },
                            { ...bulb, typeDef: JSON.parse(JSON.stringify(ComponentTypes.bulb)) }
                        ],
                        wires: [
                            { id: 'w1', fromComp: sw.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' }
                        ]
                    };

                    const mod = new CircuitComponent('module', 100, 100,
                        JSON.parse(JSON.stringify(moduleData)));
                    State.components.push(mod);

                    mod.inputValues.in0 = 1;
                    mod.calculateOutputs();
                    assertEqual(mod.outputValues.out0, 1, '子电路输出应为1');

                    mod.inputValues.in0 = 0;
                    mod.calculateOutputs();
                    assertEqual(mod.outputValues.out0, 0, '子电路输出应为0');
                }
            }
        ]
    },

    {
        name: '3. 删除连线状态栏同步',
        tests: [
            {
                name: 'updateStatusPanel 在零连线时显示提示',
                fn: () => {
                    resetState();

                    const wireInfo = { innerHTML: '' };
                    const origGet = document.getElementById;
                    document.getElementById = (id) => {
                        if (id === 'wire-info') return wireInfo;
                        if (id === 'switch-states') return { innerHTML: '' };
                        if (id === 'bulb-states') return { innerHTML: '' };
                        return null;
                    };

                    State.wires = [];
                    updateStatusPanel();
                    assert(wireInfo.innerHTML.includes('暂无连线'), '零连线时应显示"暂无连线"');

                    document.getElementById = origGet;
                }
            },
            {
                name: 'removeWire 后连线数量减少',
                fn: () => {
                    resetState();

                    const sw = new CircuitComponent('switch', 50, 50);
                    const bulb = new CircuitComponent('bulb', 200, 50);
                    State.components.push(sw, bulb);

                    State.wires.push({ id: 'w1', fromComp: sw.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' });
                    assertEqual(State.wires.length, 1, '初始应有1条连线');

                    removeWire('w1');
                    assertEqual(State.wires.length, 0, '删除后应为0条连线');
                }
            },
            {
                name: '多次删除同一条连线不会出错',
                fn: () => {
                    resetState();

                    const sw = new CircuitComponent('switch', 50, 50);
                    const bulb = new CircuitComponent('bulb', 200, 50);
                    State.components.push(sw, bulb);

                    State.wires.push({ id: 'w1', fromComp: sw.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' });
                    assertEqual(State.wires.length, 1);

                    removeWire('w1');
                    removeWire('w1');
                    removeWire('nonexistent');

                    assertEqual(State.wires.length, 0, '删除后仍应为0条连线');
                }
            },
            {
                name: '删除元件会同时删除关联连线',
                fn: () => {
                    resetState();

                    const sw = new CircuitComponent('switch', 50, 50);
                    const bulb = new CircuitComponent('bulb', 200, 50);
                    State.components.push(sw, bulb);
                    State.wires.push({ id: 'w1', fromComp: sw.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' });

                    assertEqual(State.wires.length, 1);
                    removeComponent(sw.id);
                    assertEqual(State.wires.length, 0, '删除元件后关联连线也应被删除');
                }
            },
            {
                name: 'updateStatusPanel 处理无效 wire 引用不崩溃',
                fn: () => {
                    resetState();

                    State.wires = [
                        { id: 'bad1', fromComp: 'nonexistent_a', fromPort: 'out', toComp: 'nonexistent_b', toPort: 'in' }
                    ];

                    const wireInfo = { innerHTML: '' };
                    const origGet = document.getElementById;
                    document.getElementById = (id) => {
                        if (id === 'wire-info') return wireInfo;
                        if (id === 'switch-states') return { innerHTML: '' };
                        if (id === 'bulb-states') return { innerHTML: '' };
                        return null;
                    };

                    let didThrow = false;
                    try {
                        updateStatusPanel();
                    } catch (e) {
                        didThrow = true;
                    }
                    assert(!didThrow, '处理无效连线引用时不应崩溃');

                    document.getElementById = origGet;
                }
            }
        ]
    },

    {
        name: '4. 基础逻辑门功能',
        tests: [
            {
                name: 'AND 与门：全1出1',
                fn: () => {
                    const c = new CircuitComponent('and', 0, 0);
                    c.inputValues = { a: 1, b: 1 };
                    c.calculateOutputs();
                    assertEqual(c.outputValues.out, 1);
                }
            },
            {
                name: 'AND 与门：有0出0',
                fn: () => {
                    const c = new CircuitComponent('and', 0, 0);
                    c.inputValues = { a: 0, b: 1 };
                    c.calculateOutputs();
                    assertEqual(c.outputValues.out, 0);
                }
            },
            {
                name: 'OR 或门：有1出1',
                fn: () => {
                    const c = new CircuitComponent('or', 0, 0);
                    c.inputValues = { a: 0, b: 1 };
                    c.calculateOutputs();
                    assertEqual(c.outputValues.out, 1);
                }
            },
            {
                name: 'NOT 非门：取反',
                fn: () => {
                    const c = new CircuitComponent('not', 0, 0);
                    c.inputValues = { in: 1 };
                    c.calculateOutputs();
                    assertEqual(c.outputValues.out, 0);
                }
            },
            {
                name: 'NAND 与非门',
                fn: () => {
                    const c = new CircuitComponent('nand', 0, 0);
                    c.inputValues = { a: 1, b: 1 };
                    c.calculateOutputs();
                    assertEqual(c.outputValues.out, 0);
                }
            },
            {
                name: 'NOR 或非门',
                fn: () => {
                    const c = new CircuitComponent('nor', 0, 0);
                    c.inputValues = { a: 0, b: 0 };
                    c.calculateOutputs();
                    assertEqual(c.outputValues.out, 1);
                }
            },
            {
                name: 'XOR 异或门：不同出1',
                fn: () => {
                    const c = new CircuitComponent('xor', 0, 0);
                    c.inputValues = { a: 1, b: 0 };
                    c.calculateOutputs();
                    assertEqual(c.outputValues.out, 1);
                }
            },
            {
                name: '开关：状态切换',
                fn: () => {
                    const c = new CircuitComponent('switch', 0, 0);
                    assertEqual(c.switchState, 0);
                    c.toggleSwitch();
                    assertEqual(c.switchState, 1);
                    c.toggleSwitch();
                    assertEqual(c.switchState, 0);
                }
            }
        ]
    },

    {
        name: '5. 拓扑排序与仿真',
        tests: [
            {
                name: '拓扑排序：串行电路顺序正确',
                fn: () => {
                    resetState();
                    const sw = new CircuitComponent('switch', 0, 0);
                    const not = new CircuitComponent('not', 100, 0);
                    const bulb = new CircuitComponent('bulb', 200, 0);
                    State.components.push(sw, not, bulb);
                    State.wires.push({ id: 'w1', fromComp: sw.id, fromPort: 'out', toComp: not.id, toPort: 'in' });
                    State.wires.push({ id: 'w2', fromComp: not.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' });

                    const order = topologicalSort(State.components, State.wires);
                    assertEqual(order.length, 3);
                    assertEqual(order[0].type, 'switch');
                    assertEqual(order[1].type, 'not');
                    assertEqual(order[2].type, 'bulb');
                }
            },
            {
                name: 'runSimulationStep 信号正确传播',
                fn: () => {
                    resetState();
                    const sw = new CircuitComponent('switch', 0, 0);
                    sw.switchState = 1;
                    const not = new CircuitComponent('not', 100, 0);
                    const bulb = new CircuitComponent('bulb', 200, 0);
                    State.components.push(sw, not, bulb);
                    State.wires.push({ id: 'w1', fromComp: sw.id, fromPort: 'out', toComp: not.id, toPort: 'in' });
                    State.wires.push({ id: 'w2', fromComp: not.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' });

                    const origGet = document.getElementById;
                    document.getElementById = () => null;

                    runSimulationStep();
                    assertEqual(sw.outputValues.out, 1, '开关输出应为1');
                    assertEqual(not.outputValues.out, 0, '非门输出应为0');
                    assertEqual(bulb.inputValues.in, 0, '灯泡输入应为0');

                    sw.switchState = 0;
                    runSimulationStep();
                    assertEqual(not.outputValues.out, 1, '非门输出应为1');
                    assertEqual(bulb.inputValues.in, 1, '灯泡输入应为1');

                    document.getElementById = origGet;
                }
            },
            {
                name: '两输入与门完整仿真',
                fn: () => {
                    resetState();
                    const sw1 = new CircuitComponent('switch', 0, 0);
                    const sw2 = new CircuitComponent('switch', 0, 50);
                    sw1.switchState = 1;
                    sw2.switchState = 1;
                    const and = new CircuitComponent('and', 100, 20);
                    const bulb = new CircuitComponent('bulb', 250, 30);
                    State.components.push(sw1, sw2, and, bulb);
                    State.wires.push(
                        { id: 'w1', fromComp: sw1.id, fromPort: 'out', toComp: and.id, toPort: 'a' },
                        { id: 'w2', fromComp: sw2.id, fromPort: 'out', toComp: and.id, toPort: 'b' },
                        { id: 'w3', fromComp: and.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' }
                    );

                    const origGet = document.getElementById;
                    document.getElementById = () => null;

                    runSimulationStep();
                    assertEqual(bulb.inputValues.in, 1, '两输入都为1时与门输出应为1');

                    sw1.switchState = 0;
                    runSimulationStep();
                    assertEqual(bulb.inputValues.in, 0, '有一输入为0时与门输出应为0');

                    document.getElementById = origGet;
                }
            },
            {
                name: '拓扑排序：环路电路不卡死（限时检测）',
                fn: () => {
                    resetState();
                    const not1 = new CircuitComponent('not', 0, 0);
                    const not2 = new CircuitComponent('not', 100, 0);
                    State.components.push(not1, not2);
                    State.wires.push(
                        { id: 'w_loop1', fromComp: not1.id, fromPort: 'out', toComp: not2.id, toPort: 'in' },
                        { id: 'w_loop2', fromComp: not2.id, fromPort: 'out', toComp: not1.id, toPort: 'in' }
                    );

                    const startTime = Date.now();
                    const order = topologicalSort(State.components, State.wires);
                    const elapsed = Date.now() - startTime;

                    assert(elapsed < 200, `环路检测耗时过长 (${elapsed}ms)，可能卡死`);
                    assert(order.length <= State.components.length, '环路时输出元件数不应超过总数');
                }
            },
            {
                name: '仿真环路电路：不会无限迭代卡死',
                fn: () => {
                    resetState();
                    const not1 = new CircuitComponent('not', 0, 0);
                    const not2 = new CircuitComponent('not', 100, 0);
                    State.components.push(not1, not2);
                    State.wires.push(
                        { id: 'w_loop1', fromComp: not1.id, fromPort: 'out', toComp: not2.id, toPort: 'in' },
                        { id: 'w_loop2', fromComp: not2.id, fromPort: 'out', toComp: not1.id, toPort: 'in' }
                    );

                    const origGet = document.getElementById;
                    document.getElementById = () => null;

                    const startTime = Date.now();
                    runSimulationStep();
                    const elapsed = Date.now() - startTime;

                    document.getElementById = origGet;

                    assert(elapsed < 500, `环路仿真耗时过长 (${elapsed}ms)，可能卡死`);
                }
            }
        ]
    }

];

// ============ 测试渲染 ============
function renderTestResults() {
    const container = document.getElementById('test-results');
    let html = '';

    for (const groupName in TestResults.groups) {
        const tests = TestResults.groups[groupName];
        html += `<div class="test-group"><h2>${groupName}</h2>`;
        tests.forEach(t => {
            html += `
                <div class="test-case ${t.pass ? 'pass' : 'fail'}">
                    <div class="test-case-wrap">
                        <div class="name">${t.pass ? '✅' : '❌'} ${t.name}</div>
                        ${t.error ? `<div class="error">${t.error}</div>` : ''}
                    </div>
                    <span class="status ${t.pass ? 'pass' : 'fail'}">${t.pass ? 'PASS' : 'FAIL'}</span>
                </div>
            `;
        });
        html += '</div>';
    }

    container.innerHTML = html;
    document.getElementById('total-count').textContent = TestResults.total;
    document.getElementById('pass-count').textContent = TestResults.pass;
    document.getElementById('fail-count').textContent = TestResults.fail;
}

function runAllTests() {
    TestResults.total = 0;
    TestResults.pass = 0;
    TestResults.fail = 0;
    TestResults.groups = {};

    const startTime = Date.now();

    for (const suite of testSuites) {
        resetState();
        runGroup(suite.name, suite.tests);
    }

    const elapsed = Date.now() - startTime;
    document.getElementById('time-ms').textContent = elapsed + 'ms';

    renderTestResults();
}

// 页面加载完成后自动运行测试
window.addEventListener('load', () => {
    runAllTests();
});
