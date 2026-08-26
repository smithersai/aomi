// Ambient declarations for the Smithers build API used by WORKSPACE.ts and
// PACKAGE.ts. Those files are design-partner code: they define the API through
// usage, and the @smthrs packages are implemented afterwards to match. Every
// surface is therefore permissively typed; real types replace this file when
// the packages ship.
//
// Aomi note: this file is copied from artsy/force, the first-customer sprint
// repo. Aomi-specific extensions to the API (the pnpm manifest form, the
// typed-plan agent step, workflow recursion, and cross-repo workspace import)
// are used in PACKAGE.ts files and specified in SMITHERS-NOTES.md; they are
// not declared here because every surface is already permissively typed.
//
// WORKSPACE.ts and PACKAGE.ts sit outside tsconfig.json's include set, so each
// pulls this file in with a `/// <reference path="./smithers.d.ts" />`
// directive.

/**
 * Any Smithers API surface: callable, and every property is another surface.
 * This types chains like `Smithers.PackageManager.Pnpm({ manifest })`,
 * `S.NodeModule.Bin("typescript", "tsc")`, and `sdk.apps.validate` without
 * constraining the design.
 */
interface SmithersValue {
  (...args: unknown[]): SmithersValue;
  [key: string]: SmithersValue;
  /**
   * Smithers values follow Effect's yield* protocol, so `yield* S.Runtime`
   * works inside a generator body and produces another surface.
   */
  [Symbol.iterator](): Iterator<SmithersValue, SmithersValue, unknown>;
}

/** The Smithers API entry point. Import as `import { Smithers as S }`. */
declare module "@smthrs/targets" {
  export const Smithers: SmithersValue;
}

/**
 * Any other @smthrs package a PACKAGE.ts imports. Shorthand declaration, so
 * every import is typed `any`. WORKSPACE.ts is imported by relative path,
 * not a specifier.
 */
declare module "@smthrs/*";

/**
 * Smithers values are real Effect layers, composed with the real effect
 * modules (`import * as Layer from "effect/Layer"`). Permissively typed
 * until the packages ship.
 */
declare module "effect/*";
