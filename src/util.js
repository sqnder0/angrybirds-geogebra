// Wrap setup steps in tryTo so one error doesn't block the rest of the game
export function tryTo(label, fn) {
    // console.log, console.error doesn't show up from the geogebra.org sandbox
    try { return fn(); } catch (e) { console.log("[angrybirds] Step failed:", label, String(e), e && e.stack); }
}

// On geogebra.org the scripting commands (SetBackgroundColor, ...) load after ggbOnInit runs.
// Steps that need them are tried again on every tick until they work.
let retries = [];

export function tryOrRetry(label, fn) {
    try { fn(); } catch (e) {
        if (!String(e).includes("not loaded yet")) return tryTo(label, fn);
        retries.push({ label, fn });
    }
}

export function runRetries() {
    if (!retries.length) return;
    const pending = retries;
    retries = [];
    for (const r of pending) tryOrRetry(r.label, r.fn);
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
