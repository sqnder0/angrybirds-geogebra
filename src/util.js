// Wrap setup steps in tryTo so one error doesn't block the rest of the game
export function tryTo(label, fn) {
    try { fn(); } catch (e) { console.log("Step failed:", label, String(e)); }
}

// GeoGebra point names have to start with a capital
export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}


export function modify(label, {color, labelVisible, visible} = {}){
    if (!ggbApplet.exists(label)) {
        console.log("Item for", label, "doesn't exist yet.");
        return 1;
    }

    if (color !== undefined) {
        tryTo("Set color for " + label, function () {
            ggbApplet.setColor(label, color[0], color[1], color[2]);
        });
    }

    if (labelVisible !== undefined) {
        tryTo("Set label visibility for " + label, function () {
            ggbApplet.setLabelVisible(label, labelVisible);
        });
    }

    if (visible !== undefined) {
        tryTo("Set visibility for " + label, function () {
            ggbApplet.setVisible(label, visible);
        });
    }

}

// evalXML rebuilds the whole construction on every call, which gets slow with many objects.
// Elements are collected with queueXML and added together in one flushXML call.
let pendingXML = "";

export function queueXML(xml) {
    pendingXML += xml;
}

export function flushXML() {
    if (!pendingXML) return;
    const xml = pendingXML;
    pendingXML = "";
    ggbApplet.evalXML(xml);
}
