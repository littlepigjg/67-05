const State = {
    components: [],
    wires: [],
    modules: {},
    selectedComponent: null,
    connectingFrom: null,
    tempWireEnd: null,
    isSimulating: false,
    simInterval: null,
    nextId: 1,
    switchCounter: 1,
    bulbCounter: 1,
    gateCounter: 1,
    moduleCounter: 1
};

function resetCounters() {
    State.switchCounter = 1;
    State.bulbCounter = 1;
    State.gateCounter = 1;
    State.moduleCounter = 1;
}
