/* Call stuff in tryto to not block the game when errors appear. */
export function tryTo(label, fn) {
    try { fn(); } catch (e) { console.log("Step failed:", label, String(e)); }
}

/*Capitalization of point names*/
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
