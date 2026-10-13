import type { ModuleDefinition } from "@/core/modules";

/**
 * How the dropshipping module plugs into a brand's screens (T-07). It has no
 * screens yet; suppliers, products, pricing and orders arrive from release R5.
 */
export const dropshippingModule: ModuleDefinition = {
  id: "dropshipping",
  label: "Dropshipping",
  summary: "Suppliers, products, pricing and store orders. These screens arrive in a later release.",
  tabs: [],
};
