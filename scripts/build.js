// Bundles src/ and zips geogebra/ into angrybirds.ggb.
// The images are embedded in the bundle as data urls (see the "assets" module below),
// because GeoGebra throws away zip files that the construction doesn't use when a .ggb
// gets uploaded or re-saved. Images created from js don't exist yet at that point.
import * as esbuild from "esbuild";
import { zipSync } from "fflate";
import fs from "node:fs";
import path from "node:path";

const GGB_DIR = "geogebra";
const ASSET_DIR = path.join(GGB_DIR, "assets");
const OUT_JS = path.join(GGB_DIR, "geogebra_javascript.js");
const OUT_GGB = "angrybirds.ggb";

const watch = process.argv.includes("--watch");
const bundleOnly = process.argv.includes("--bundle-only");

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
    });
}

// `import ASSETS from "assets"` gives { "assets/x.png": "data:image/png;base64,..." }
const assetsPlugin = {
    name: "assets",
    setup(build) {
        build.onResolve({ filter: /^assets$/ }, () => ({ path: "assets", namespace: "assets" }));
        build.onLoad({ filter: /.*/, namespace: "assets" }, () => {
            const files = walk(ASSET_DIR).filter((f) => f.endsWith(".png"));
            const assets = {};
            for (const f of files) {
                const name = path.relative(GGB_DIR, f).split(path.sep).join("/");
                assets[name] = "data:image/png;base64," + fs.readFileSync(f).toString("base64");
            }
            return {
                contents: "export default " + JSON.stringify(assets),
                loader: "js",
                watchFiles: files,
                watchDirs: walk(ASSET_DIR).map((f) => path.dirname(f)),
            };
        });
    },
};

function zip() {
    // Only the GeoGebra files, the assets are already inside the bundle
    const files = {};
    for (const name of fs.readdirSync(GGB_DIR)) {
        const p = path.join(GGB_DIR, name);
        if (fs.statSync(p).isFile()) files[name] = fs.readFileSync(p);
    }
    fs.writeFileSync(OUT_GGB, zipSync(files, { level: 9 }));
    console.log(`Wrote ${OUT_GGB} (${(fs.statSync(OUT_GGB).size / 1024).toFixed(0)} KB)`);
}

const options = {
    entryPoints: ["src/main.js"],
    bundle: true,
    format: "iife",
    outfile: OUT_JS,
    plugins: [assetsPlugin],
};

if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("Watching...");
} else {
    await esbuild.build(options);
    if (!bundleOnly) zip();
}
