// tsyringe (used by the passkey library) throws at load unless the reflect polyfill runs first.
import "reflect-metadata";
export * from "../../node_modules/tsyringe/dist/esm5/index.js";
