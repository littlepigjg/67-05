// ============ 元件类 ============
class CircuitComponent {
    constructor(type, x, y, moduleData = null) {
        this.id = 'comp_' + (State.nextId++);
        this.type = type;
        this.x = x;
        this.y = y;
        this.inputValues = {};
        this.outputValues = {};
        this.moduleData = moduleData;

        if (moduleData) {
            this.typeDef = JSON.parse(JSON.stringify(ComponentTypes.module));
            this.typeDef.inputs = moduleData.inputs || [];
            this.typeDef.outputs = moduleData.outputs || [];
            this.typeDef.name = moduleData.name;
            const h = Math.max(this.typeDef.inputs.length, this.typeDef.outputs.length, 2);
            this.typeDef.height = 60 + h * 20;
        } else {
            this.typeDef = ComponentTypes[type];
        }

        this.typeDef.inputs.forEach(p => { this.inputValues[p.id] = 0; });
        this.typeDef.outputs.forEach(p => { this.outputValues[p.id] = 0; });

        this.label = this._generateLabel();
        this.switchState = 0;
    }

    _generateLabel() {
        switch (this.type) {
            case 'switch': return `SW${State.switchCounter++}`;
            case 'bulb': return `L${State.bulbCounter++}`;
            case 'module': return `${this.moduleData?.name || 'M'}${State.moduleCounter++}`;
            default: return `${this.type.toUpperCase()}${State.gateCounter++}`;
        }
    }

    getPortPosition(portType, portId) {
        const def = this.typeDef;
        const ports = portType === 'input' ? def.inputs : def.outputs;
        const portIndex = ports.findIndex(p => p.id === portId);
        const count = ports.length;
        const spacing = def.height / (count + 1);
        const offsetY = spacing * (portIndex + 1);

        if (portType === 'input') {
            return { x: this.x, y: this.y + offsetY };
        } else {
            return { x: this.x + def.width, y: this.y + offsetY };
        }
    }

    getAllPorts() {
        const ports = [];
        this.typeDef.inputs.forEach(p => {
            ports.push({ type: 'input', id: p.id, pos: this.getPortPosition('input', p.id) });
        });
        this.typeDef.outputs.forEach(p => {
            ports.push({ type: 'output', id: p.id, pos: this.getPortPosition('output', p.id) });
        });
        return ports;
    }

    containsPoint(px, py) {
        const margin = 10;
        return px >= this.x - margin && px <= this.x + this.typeDef.width + margin &&
               py >= this.y - margin && py <= this.y + this.typeDef.height + margin;
    }

    calculateOutputs() {
        if (this.type === 'switch') {
            this.outputValues.out = this.switchState;
            return;
        }
        if (this.type === 'bulb') {
            return;
        }
        if (this.type === 'module' && this.moduleData) {
            this._calculateModule();
            return;
        }

        const result = calculateGateOutput(this.type, this.inputValues);
        if (this.typeDef.outputs.length > 0) {
            this.outputValues[this.typeDef.outputs[0].id] = result;
        }
    }

    _calculateModule() {
        const md = this.moduleData;
        if (!md || !md.components || !md.wires) return;

        const externalInputs = {};
        this.typeDef.inputs.forEach(p => {
            externalInputs[p.id] = this.inputValues[p.id] || 0;
        });

        const outputs = simulateModuleStepInternal(md, externalInputs);

        this.typeDef.outputs.forEach(p => {
            this.outputValues[p.id] = outputs[p.id] || 0;
        });
    }

    render() {
        const el = document.createElement('div');
        el.className = 'circuit-component';
        el.dataset.id = this.id;
        el.style.left = this.x + 'px';
        el.style.top = this.y + 'px';
        el.style.width = this.typeDef.width + 'px';
        el.style.minHeight = this.typeDef.height + 'px';

        const label = document.createElement('div');
        label.className = 'component-label';
        label.textContent = this.label;
        el.appendChild(label);

        const body = document.createElement('div');
        body.className = 'component-body';
        body.style.minHeight = (this.typeDef.height - 30) + 'px';

        if (this.type === 'switch') {
            const sw = document.createElement('div');
            sw.className = 'switch-body' + (this.switchState ? ' on' : '');
            sw.innerHTML = `<span class="switch-text">${this.switchState ? 'ON' : 'OFF'}</span>`;
            sw.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleSwitch();
            });
            body.appendChild(sw);
        } else if (this.type === 'bulb') {
            const bulb = document.createElement('div');
            const isOn = (this.inputValues.in || 0) === 1;
            bulb.className = 'bulb-body' + (isOn ? ' on' : '');
            bulb.textContent = isOn ? '💡' : '⚫';
            body.appendChild(bulb);
        } else {
            const gate = document.createElement('div');
            const cls = this.typeDef.gateClass || this.type;
            gate.className = `gate-symbol ${cls}`;
            if (this.type === 'module') {
                gate.textContent = this.moduleData?.name?.substring(0, 6) || 'MOD';
            } else {
                gate.textContent = this.type.toUpperCase();
            }
            body.appendChild(gate);
        }

        el.appendChild(body);

        this.typeDef.inputs.forEach((p, i) => {
            const port = document.createElement('div');
            port.className = `port input input-${i}`;
            port.dataset.portType = 'input';
            port.dataset.portId = p.id;
            port.dataset.componentId = this.id;
            port.title = p.label;
            if (this.inputValues[p.id] === 1) port.classList.add('high');
            if (this._isPortConnected('input', p.id)) port.classList.add('connected');
            port.addEventListener('click', (e) => onPortClick(e, this, 'input', p.id));
            port.addEventListener('mousedown', (e) => e.stopPropagation());
            el.appendChild(port);
        });

        this.typeDef.outputs.forEach((p, i) => {
            const port = document.createElement('div');
            port.className = `port output output-${i}`;
            port.dataset.portType = 'output';
            port.dataset.portId = p.id;
            port.dataset.componentId = this.id;
            port.title = p.label;
            if (this.outputValues[p.id] === 1) port.classList.add('high');
            if (this._isPortConnected('output', p.id)) port.classList.add('connected');
            port.addEventListener('click', (e) => onPortClick(e, this, 'output', p.id));
            port.addEventListener('mousedown', (e) => e.stopPropagation());
            el.appendChild(port);
        });

        el.addEventListener('mousedown', (e) => onComponentMouseDown(e, this));

        return el;
    }

    _isPortConnected(portType, portId) {
        return State.wires.some(w => {
            if (portType === 'input') {
                return w.toComp === this.id && w.toPort === portId;
            } else {
                return w.fromComp === this.id && w.fromPort === portId;
            }
        });
    }

    toggleSwitch() {
        this.switchState = this.switchState ? 0 : 1;
        this.outputValues.out = this.switchState;
        if (State.isSimulating) {
            runSimulationStep();
        }
        if (typeof renderAll === 'function') renderAll();
    }
}
