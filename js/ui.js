// ============ 画布渲染 ============
function renderAll() {
    const canvas = document.getElementById('canvas');
    const wiresLayer = document.getElementById('wires-layer');
    if (!canvas || !wiresLayer) return;

    canvas.innerHTML = '';
    wiresLayer.innerHTML = '';

    renderWires();

    State.components.forEach(comp => {
        const el = comp.render();
        if (State.selectedComponent && State.selectedComponent.id === comp.id) {
            el.classList.add('selected');
        }
        if (State.isSimulating) {
            el.classList.add('simulating');
        }
        canvas.appendChild(el);
    });

    if (State.connectingFrom && State.tempWireEnd) {
        renderTempWire();
    }

    updateStatusPanel();
}

function renderWires() {
    const layer = document.getElementById('wires-layer');
    if (!layer) return;

    State.wires.forEach(wire => {
        const fromComp = State.components.find(c => c.id === wire.fromComp);
        const toComp = State.components.find(c => c.id === wire.toComp);
        if (!fromComp || !toComp) return;

        const from = fromComp.getPortPosition('output', wire.fromPort);
        const to = toComp.getPortPosition('input', wire.toPort);
        const outVal = fromComp.outputValues[wire.fromPort] || 0;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = routeWire(from, to, [fromComp, toComp]);
        path.setAttribute('d', d);
        path.setAttribute('class', 'wire-path' + (outVal === 1 ? ' high' : '') + (State.isSimulating ? ' flow' : ''));
        path.dataset.wireId = wire.id;
        path.style.pointerEvents = 'stroke';
        path.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeWire(wire.id);
        });
        layer.appendChild(path);
    });
}

function renderTempWire() {
    const layer = document.getElementById('wires-layer');
    if (!layer || !State.connectingFrom) return;

    const { comp, portType, portId } = State.connectingFrom;
    const start = comp.getPortPosition(portType, portId);
    const end = State.tempWireEnd;
    if (!start || !end) return;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    path.setAttribute('d', d);
    path.setAttribute('class', 'temp-wire');
    layer.appendChild(path);
}

// ============ 拖放交互 ============
function onComponentMouseDown(e, comp) {
    if (e.target.classList.contains('port')) return;
    e.preventDefault();

    State.selectedComponent = comp;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = comp.x;
    const origY = comp.y;
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const canvasContainer = document.getElementById('canvas-container');

    function onMouseMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        comp.x = Math.max(0, origX + dx + canvasContainer.scrollLeft - canvasWrapper.offsetLeft);
        comp.y = Math.max(0, origY + dy + canvasContainer.scrollTop - canvasWrapper.offsetTop);
        renderAll();
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    renderAll();
}

function onPortClick(e, comp, portType, portId) {
    e.stopPropagation();

    if (!State.connectingFrom) {
        State.connectingFrom = { comp, portType, portId };
        renderAll();
        document.querySelectorAll(`.port[data-component-id="${comp.id}"][data-port-id="${portId}"]`)
            .forEach(p => p.classList.add('connecting'));
        return;
    }

    const from = State.connectingFrom;
    if (from.comp.id === comp.id) {
        cancelConnection();
        return;
    }

    let fromComp, fromPort, toComp, toPort;
    if (from.portType === 'output' && portType === 'input') {
        fromComp = from.comp; fromPort = from.portId;
        toComp = comp; toPort = portId;
    } else if (from.portType === 'input' && portType === 'output') {
        fromComp = comp; fromPort = portId;
        toComp = from.comp; toPort = from.portId;
    } else {
        cancelConnection();
        return;
    }

    const existing = State.wires.find(w => w.toComp === toComp.id && w.toPort === toPort);
    if (existing) {
        State.wires = State.wires.filter(w => w.id !== existing.id);
    }

    State.wires.push({
        id: 'wire_' + (State.nextId++),
        fromComp: fromComp.id,
        fromPort: fromPort,
        toComp: toComp.id,
        toPort: toPort
    });

    cancelConnection();
    renderAll();
}

function cancelConnection() {
    State.connectingFrom = null;
    State.tempWireEnd = null;
    renderAll();
}

// ============ 从元件面板拖入 ============
function setupDragDrop() {
    const items = document.querySelectorAll('.component-item');
    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('componentType', item.dataset.type);
            const moduleName = item.dataset.moduleName;
            if (moduleName) {
                e.dataTransfer.setData('moduleName', moduleName);
            }
        });
    });

    const canvas = document.getElementById('canvas');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const canvasContainer = document.getElementById('canvas-container');

    canvasWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    canvasWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('componentType');
        if (!type) return;

        const rect = canvasWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left - 50;
        const y = e.clientY - rect.top - 40;

        let comp;
        const moduleName = e.dataTransfer.getData('moduleName');
        if (moduleName && State.modules[moduleName]) {
            comp = new CircuitComponent('module', Math.max(0, x), Math.max(0, y),
                JSON.parse(JSON.stringify(State.modules[moduleName])));
        } else {
            comp = new CircuitComponent(type, Math.max(0, x), Math.max(0, y));
        }

        State.components.push(comp);
        State.selectedComponent = comp;
        renderAll();
    });

    canvasWrapper.addEventListener('mousemove', (e) => {
        if (State.connectingFrom) {
            const rect = canvasWrapper.getBoundingClientRect();
            State.tempWireEnd = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            const layer = document.getElementById('wires-layer');
            const tempPaths = layer.querySelectorAll('.temp-wire');
            tempPaths.forEach(p => p.remove());
            renderTempWire();
        }
    });

    canvasWrapper.addEventListener('click', (e) => {
        if (State.connectingFrom && (e.target === canvasWrapper || e.target === canvas)) {
            cancelConnection();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (State.selectedComponent) {
                removeComponent(State.selectedComponent.id);
                e.preventDefault();
            }
        }
        if (e.key === 'Escape') {
            cancelConnection();
            State.selectedComponent = null;
            renderAll();
        }
    });

    canvasWrapper.addEventListener('contextmenu', (e) => {
        if (e.target === canvas || e.target === canvasWrapper) {
            e.preventDefault();
            State.selectedComponent = null;
            cancelConnection();
            renderAll();
        }
    });
}

// ============ 删除操作 ============
function removeComponent(compId) {
    State.wires = State.wires.filter(w => w.fromComp !== compId && w.toComp !== compId);
    State.components = State.components.filter(c => c.id !== compId);
    State.selectedComponent = null;
    renderAll();
    updateStatusPanel();
}

function removeWire(wireId) {
    const beforeLen = State.wires.length;
    State.wires = State.wires.filter(w => w.id !== wireId);
    const afterLen = State.wires.length;

    if (beforeLen !== afterLen) {
        renderAll();
        updateStatusPanel();
    }
}

// ============ 状态面板 ============
function updateStatusPanel() {
    const switches = State.components.filter(c => c.type === 'switch');
    const bulbs = State.components.filter(c => c.type === 'bulb');

    const switchStates = document.getElementById('switch-states');
    if (switchStates) {
        if (switches.length === 0) {
            switchStates.innerHTML = '<p class="hint">暂无开关</p>';
        } else {
            switchStates.innerHTML = switches.map(s => `
                <div class="state-item">
                    <span>${s.label}</span>
                    <span class="state-badge ${s.switchState ? 'high' : 'low'}">${s.switchState}</span>
                </div>
            `).join('');
        }
    }

    const bulbStates = document.getElementById('bulb-states');
    if (bulbStates) {
        if (bulbs.length === 0) {
            bulbStates.innerHTML = '<p class="hint">暂无灯泡</p>';
        } else {
            bulbStates.innerHTML = bulbs.map(b => {
                const val = b.inputValues.in || 0;
                return `
                    <div class="state-item">
                        <span>${b.label}</span>
                        <span class="state-badge ${val ? 'high' : 'low'}">${val ? '亮' : '灭'}</span>
                    </div>
                `;
            }).join('');
        }
    }

    const wireInfo = document.getElementById('wire-info');
    if (wireInfo) {
        if (!State.wires || State.wires.length === 0) {
            wireInfo.innerHTML = '<p class="hint">暂无连线</p>';
        } else {
            const wireItems = [];
            State.wires.forEach(w => {
                const from = State.components.find(c => c.id === w.fromComp);
                const to = State.components.find(c => c.id === w.toComp);
                if (!from || !to) {
                    console.warn('Invalid wire reference:', w);
                    return;
                }
                const val = from.outputValues[w.fromPort] || 0;
                wireItems.push(`
                    <div class="wire-info-item">
                        <span>${from.label}→${to.label}</span>
                        <span class="state-badge ${val ? 'high' : 'low'}">${val}</span>
                    </div>
                `);
            });

            if (wireItems.length === 0) {
                wireInfo.innerHTML = '<p class="hint">暂无连线</p>';
            } else {
                wireInfo.innerHTML = wireItems.join('');
            }
        }
    }
}
