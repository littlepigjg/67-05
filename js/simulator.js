// ============ 仿真引擎 ============

function topologicalSort(components, wires) {
    const indeg = {};
    const adj = {};
    components.forEach(c => {
        indeg[c.id] = 0;
        adj[c.id] = [];
    });

    wires.forEach(w => {
        if (adj[w.fromComp]) {
            adj[w.fromComp].push(w.toComp);
        }
        if (indeg[w.toComp] !== undefined) {
            indeg[w.toComp]++;
        }
    });

    const queue = [];
    for (const id in indeg) {
        if (indeg[id] === 0) queue.push(id);
    }

    const order = [];
    let iterations = 0;
    const MAX_ITER = components.length + 1;
    while (queue.length && iterations < MAX_ITER) {
        iterations++;
        const id = queue.shift();
        order.push(id);
        for (const next of adj[id]) {
            indeg[next]--;
            if (indeg[next] === 0) queue.push(next);
        }
    }

    if (iterations >= MAX_ITER) {
        console.warn('[拓扑排序] 检测到环路或异常，已强制终止，部分元件可能无法正常计算');
    }

    return order.map(id => components.find(c => c.id === id)).filter(Boolean);
}

function calculateGateOutput(type, inputValues) {
    const inputs = Object.values(inputValues);
    switch (type) {
        case 'and':  return inputs.every(v => v === 1) ? 1 : 0;
        case 'or':   return inputs.some(v => v === 1) ? 1 : 0;
        case 'not':  return inputs[0] === 1 ? 0 : 1;
        case 'nand': return inputs.every(v => v === 1) ? 0 : 1;
        case 'nor':  return inputs.some(v => v === 1) ? 0 : 1;
        case 'xor':  return inputs.filter(v => v === 1).length % 2 === 1 ? 1 : 0;
        default: return 0;
    }
}

function simulateStep(components, wires) {
    components.forEach(c => {
        if (c.typeDef && c.typeDef.inputs) {
            c.typeDef.inputs.forEach(p => { c.inputValues[p.id] = 0; });
        }
    });

    wires.forEach(w => {
        const from = components.find(c => c.id === w.fromComp);
        const to = components.find(c => c.id === w.toComp);
        if (from && to) {
            to.inputValues[w.toPort] = from.outputValues[w.fromPort] || 0;
        }
    });

    components.forEach(c => {
        if (c.type === 'switch') {
            c.outputValues.out = c.switchState || 0;
        } else if (c.type === 'bulb') {
        } else if (c.type === 'module' && c.moduleData) {
            if (typeof c._calculateModule === 'function') {
                c._calculateModule();
            }
        } else if (c.typeDef && c.typeDef.outputs && c.typeDef.outputs.length > 0) {
            const result = calculateGateOutput(c.type, c.inputValues);
            c.outputValues[c.typeDef.outputs[0].id] = result;
        }
    });
}

function simulateModuleStepInternal(moduleData, externalInputs) {
    const { components, wires, inputMap, outputMap, inputs, outputs } = moduleData;

    const localComps = components.map(c => ({
        ...c,
        inputValues: {},
        outputValues: {}
    }));

    localComps.forEach(c => {
        if (c.typeDef && c.typeDef.inputs) {
            c.typeDef.inputs.forEach(p => { c.inputValues[p.id] = 0; });
        }
        if (c.typeDef && c.typeDef.outputs) {
            c.typeDef.outputs.forEach(p => { c.outputValues[p.id] = 0; });
        }
    });

    inputs.forEach((p, i) => {
        const comp = localComps.find(c => c.id === inputMap[p.id]);
        if (comp) {
            comp.switchState = externalInputs[p.id] || 0;
            comp.outputValues = { out: comp.switchState };
        }
    });

    const order = topologicalSort(localComps, wires);
    const MAX_ITERATIONS = 10;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        localComps.forEach(c => {
            if (c.typeDef && c.typeDef.inputs && c.type !== 'switch') {
                c.typeDef.inputs.forEach(p => { c.inputValues[p.id] = 0; });
            }
        });

        wires.forEach(w => {
            const from = localComps.find(c => c.id === w.fromComp);
            const to = localComps.find(c => c.id === w.toComp);
            if (from && to) {
                to.inputValues[w.toPort] = from.outputValues[w.fromPort] || 0;
            }
        });

        order.forEach(c => {
            if (c.type === 'switch') {
            } else if (c.type === 'bulb') {
            } else if (c.type === 'module' && c.moduleData) {
                const nestedInputs = {};
                if (c.typeDef && c.typeDef.inputs) {
                    c.typeDef.inputs.forEach(p => {
                        nestedInputs[p.id] = c.inputValues[p.id] || 0;
                    });
                }
                const nestedOutputs = simulateModuleStepInternal(c.moduleData, nestedInputs);
                if (c.typeDef && c.typeDef.outputs) {
                    c.typeDef.outputs.forEach(p => {
                        c.outputValues[p.id] = nestedOutputs[p.id] || 0;
                    });
                }
            } else if (c.typeDef && c.typeDef.outputs && c.typeDef.outputs.length > 0) {
                const result = calculateGateOutput(c.type, c.inputValues);
                c.outputValues[c.typeDef.outputs[0].id] = result;
            }
        });
    }

    const resultOutputs = {};
    outputs.forEach((p, i) => {
        const comp = localComps.find(c => c.id === outputMap[p.id]);
        if (comp) {
            resultOutputs[p.id] = comp.inputValues.in || 0;
        }
    });

    return resultOutputs;
}

function runSimulationStep() {
    const order = topologicalSort(State.components, State.wires);
    const MAX_ITERATIONS = 10;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let changed = false;

        order.forEach(c => {
            if (c.typeDef && c.typeDef.inputs && c.type !== 'switch') {
                c.typeDef.inputs.forEach(p => { c.inputValues[p.id] = 0; });
            }
        });

        State.wires.forEach(w => {
            const from = State.components.find(c => c.id === w.fromComp);
            const to = State.components.find(c => c.id === w.toComp);
            if (from && to) {
                const oldVal = to.inputValues[w.toPort];
                const newVal = from.outputValues[w.fromPort] || 0;
                if (oldVal !== newVal) changed = true;
                to.inputValues[w.toPort] = newVal;
            }
        });

        order.forEach(c => {
            const oldOutputs = JSON.stringify(c.outputValues);
            c.calculateOutputs();
            const newOutputs = JSON.stringify(c.outputValues);
            if (oldOutputs !== newOutputs) changed = true;
        });

        if (!changed) break;
    }
}

function startSimulation() {
    State.isSimulating = true;
    runSimulationStep();
    document.getElementById('btn-run').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    document.getElementById('status-value').textContent = '运行中';
    document.getElementById('status-value').classList.add('running');
    if (typeof renderAll === 'function') renderAll();
}

function stopSimulation() {
    State.isSimulating = false;
    document.getElementById('btn-run').disabled = false;
    document.getElementById('btn-stop').disabled = true;
    document.getElementById('status-value').textContent = '停止';
    document.getElementById('status-value').classList.remove('running');
    if (typeof renderAll === 'function') renderAll();
}
