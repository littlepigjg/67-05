const ComponentTypes = {
    switch: {
        name: '开关',
        inputs: [],
        outputs: [{ id: 'out', label: 'OUT' }],
        width: 100,
        height: 70
    },
    bulb: {
        name: '灯泡',
        inputs: [{ id: 'in', label: 'IN' }],
        outputs: [],
        width: 90,
        height: 90
    },
    and: {
        name: '与门',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        outputs: [{ id: 'out', label: 'OUT' }],
        width: 110,
        height: 80,
        gateClass: 'and'
    },
    or: {
        name: '或门',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        outputs: [{ id: 'out', label: 'OUT' }],
        width: 110,
        height: 80,
        gateClass: 'or'
    },
    not: {
        name: '非门',
        inputs: [{ id: 'in', label: 'IN' }],
        outputs: [{ id: 'out', label: 'OUT' }],
        width: 100,
        height: 65,
        gateClass: 'not'
    },
    nand: {
        name: '与非门',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        outputs: [{ id: 'out', label: 'OUT' }],
        width: 110,
        height: 80,
        gateClass: 'nand'
    },
    nor: {
        name: '或非门',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        outputs: [{ id: 'out', label: 'OUT' }],
        width: 110,
        height: 80,
        gateClass: 'nor'
    },
    xor: {
        name: '异或门',
        inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        outputs: [{ id: 'out', label: 'OUT' }],
        width: 110,
        height: 80,
        gateClass: 'xor'
    },
    module: {
        name: '子电路',
        width: 130,
        height: 90,
        gateClass: 'module'
    }
};
