
// This file is the entrypoint for the Cloud Function.
// It is responsible for importing the compiled TypeScript code
// from the `dist` directory and exporting the function.

const app = require("./dist/index.js");
exports.receiveEmailLead = app.receiveEmailLead;
