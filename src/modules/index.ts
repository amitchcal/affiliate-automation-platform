import type { ModuleDefinition } from "@/core/modules";
import { affiliateModule } from "./affiliate/module";
import { dropshippingModule } from "./dropshipping/module";

/**
 * Every module, in the order their tabs appear. Only src/app reads this list:
 * core must not import a module, and modules must not import each other.
 */
export const MODULES: ModuleDefinition[] = [affiliateModule, dropshippingModule];
