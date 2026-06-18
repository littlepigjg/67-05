// ============ 电路逻辑仿真器 - 主入口文件
// 各模块已拆分到 js/ 目录下，按依赖顺序加载

function init() {
    const saved = localStorage.getItem('circuit_modules');
    if (saved) {
        try { State.modules = JSON.parse(saved); } catch (e) { State.modules = {}; }
    }

    setupDragDrop();
    renderModuleList();

    document.getElementById('btn-run').addEventListener('click', startSimulation);
    document.getElementById('btn-stop').addEventListener('click', stopSimulation);
    document.getElementById('btn-step').addEventListener('click', () => {
        runSimulationStep();
        renderAll();
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (State.components.length && !confirm('确定要清空画布吗？')) return;
        stopSimulation();
        State.components = [];
        State.wires = [];
        State.selectedComponent = null;
        State.connectingFrom = null;
        State.tempWireEnd = null;
        resetCounters();
        renderAll();
    });
    document.getElementById('btn-save').addEventListener('click', () => showModuleDialog(false));
    document.getElementById('btn-export-module').addEventListener('click', () => showModuleDialog(true));
    document.getElementById('btn-load').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                loadCircuitFile(data);
            } catch (err) {
                alert('文件解析失败: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    document.getElementById('modal-cancel').addEventListener('click', hideModuleDialog);
    document.getElementById('modal-confirm').addEventListener('click', () => {
        const dialog = document.getElementById('module-dialog');
        if (dialog.dataset.mode === 'export') {
            exportModule();
        } else {
            saveCircuitFile();
        }
    });

    renderAll();

    setTimeout(() => {
        State.components.push(new CircuitComponent('switch', 80, 100));
        State.components.push(new CircuitComponent('switch', 80, 220));
        State.components.push(new CircuitComponent('and', 280, 150));
        State.components.push(new CircuitComponent('bulb', 480, 155));
        renderAll();

        setTimeout(() => {
            const sw1 = State.components[0];
            const sw2 = State.components[1];
            const and = State.components[2];
            const bulb = State.components[3];

            State.wires.push({ id: 'wire_' + State.nextId++, fromComp: sw1.id, fromPort: 'out', toComp: and.id, toPort: 'a' });
            State.wires.push({ id: 'wire_' + State.nextId++, fromComp: sw2.id, fromPort: 'out', toComp: and.id, toPort: 'b' });
            State.wires.push({ id: 'wire_' + State.nextId++, fromComp: and.id, fromPort: 'out', toComp: bulb.id, toPort: 'in' });

            renderAll();
        }, 100);
    }, 100);
}

document.addEventListener('DOMContentLoaded', init);
