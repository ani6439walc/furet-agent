#!/usr/bin/env npx tsx
import { resolve } from "node:path";

const command = process.argv[2];

switch (command) {
  case "gateway":
    await import(resolve(import.meta.dirname!, "../src/gateway.ts"));
    break;
  default:
    await import(resolve(import.meta.dirname!, "../src/cli.ts"));
    break;
}
