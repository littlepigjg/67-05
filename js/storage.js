// ============ 子电路系统 ============

function showModuleDialog(isExport) {
    const dialog = document.getElementById('module-dialog');
    document.getElementById('modal-title').textContent = isExport ? '导出子电路' : '保存电路';
    document.getElementById('module-name').value = '';
    dialog.classList.remove('hidden');
    dialog.dataset.mode = isExport ? 'export' : 'save';
}

function hideModuleDialog() {
    document.getElementById('module-dialog').classList.add('hidden');
}

function extractModuleData(name) {
    const switches = State.components.filter(c => c.type === 'switch');
    const bulbs = State.components.filter(c => c.type === 'bulb');

    const inputs = switches.map((s, i) => ({ id: 'in' + i, label: s.label }));
    const outputs = bulbs.map((b, i) => ({ id: 'out' + i, label: b.label }));

    const compData = JSON.parse(JSON.stringify(State.components, (key, value) => {
        if (key === 'moduleData' && value) return value;
        return value;
    }));

    compData.forEach(c => {
        if (!c.typeDef) {
            const orig = State.components.find(cc => cc.id === c.id);
            if (orig) c.typeDef = JSON.parse(JSON.stringify(orig.typeDef));
        }
    });

    const inputMap = {};
    inputs.forEach((p, i) => { inputMap[p.id] = switches[i].id; });
    const outputMap = {};
    outputs.forEach((p, i) => { outputMap[p.id] = bulbs[i].id; });

    return {
        name,
        inputs,
        outputs,
        inputMap,
        outputMap,
        components: compData,
        wires: JSON.parse(JSON.stringify(State.wires))
    };
}

function exportModule() {
    const name = document.getElementById('module-name').value.trim();
    if (!name) { alert('请输入子电路名称'); return; }

    const moduleData = extractModuleData(name);
    State.modules[name] = moduleData;
    localStorage.setItem('circuit_modules', JSON.stringify(State.modules));
    renderModuleList();
    hideModuleDialog();
    alert(`子电路 "${name}" 已保存！`);
}

function saveCircuitFile() {
    const name = document.getElementById('module-name').value.trim() || 'circuit';
    const data = {
        components: JSON.parse(JSON.stringify(State.components, (key, value) => {
            if (key === 'moduleData' && value) return value;
            return value;
        })),
        wires: JSON.parse(JSON.stringify(State.wires)),
        nextId: State.nextId,
        switchCounter: State.switchCounter,
        bulbCounter: State.bulbCounter,
        gateCounter: State.gateCounter,
        moduleCounter: State.moduleCounter
    };

    data.components.forEach(c => {
        if (!c.typeDef) {
            const orig = State.components.find(cc => cc.id === c.id);
            if (orig) c.typeDef = JSON.parse(JSON.stringify(orig.typeDef));
        }
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.json';
    a.click();
    URL.revokeObjectURL(url);
    hideModuleDialog();
}

function loadCircuitFile(data) {
    State.components = [];
    State.wires = data.wires || [];
    State.nextId = data.nextId || 1;
    State.switchCounter = data.switchCounter || 1;
    State.bulbCounter = data.bulbCounter || 1;
    State.gateCounter = data.gateCounter || 1;
    State.moduleCounter = data.moduleCounter || 1;
    State.selectedComponent = null;
    State.connectingFrom = null;
    State.tempWireEnd = null;

    (data.components || []).forEach(c => {
        let moduleData = null;
        if (c.moduleData) {
            moduleData = JSON.parse(JSON.stringify(c.moduleData));
        }
        const comp = new CircuitComponent(c.type, c.x, c.y, moduleData);
        comp.id = c.id;
        comp.label = c.label;
        comp.switchState = c.switchState || 0;
        comp.inputValues = c.inputValues ? JSON.parse(JSON.stringify(c.inputValues)) : {};
        comp.outputValues = c.outputValues ? JSON.parse(JSON.stringify(c.outputValues)) : {};
        if (c.typeDef) {
            comp.typeDef = JSON.parse(JSON.stringify(c.typeDef));
        }
        State.components.push(comp);
    });

    if (typeof renderAll === 'function') renderAll();
}

function renderModuleList() {
    const list = document.getElementById('module-list');
    const moduleNames = Object.keys(State.modules);
    if (moduleNames.length === 0) {
        list.innerHTML = '<p class="hint">保存的电路将出现在这里</p>';
        return;
    }
    list.innerHTML = moduleNames.map(name => `
        <div class="component-item" draggable="true" data-type="module" data-module-name="${name}">
            <span class="comp-gate" style="background:linear-gradient(135deg,#229954,#27ae60)">📦</span>
            <span class="comp-name">${name}</span>
        </div>
    `).join('');

    if (typeof setupDragDrop === 'function') {
        setTimeout(() => setupDragDrop(), 0);
    }
}
