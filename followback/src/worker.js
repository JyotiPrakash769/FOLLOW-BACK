// @ts-nocheck - gather() and self.JSZip are provided by the build concatenation.
/**
 * Parsing worker. Built by build.js into a standalone classic worker so the
 * main thread never blocks on JSON.parse of a multi-megabyte export.
 */
self.onmessage = async function (e) {
  try {
    const r = await gather(e.data.files, self.JSZip, function (p) {
      self.postMessage({ type: "progress", done: p.done, total: p.total, name: p.name });
    });
    self.postMessage({ type: "done", result: r });
  } catch (err) {
    self.postMessage({ type: "error", message: String((err && err.message) || err), name: (err && err.name) || "Error" });
  }
};
