"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/core/supabase/server";
import { importForClient, importNotice } from "@/modules/affiliate/results/clickbank";

function back(path: string, kind: "notice" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

const resultsPath = (brandId: string) => `/brands/${brandId}/results`;

/** P-01: import ClickBank sales for the account and match to tracked links. */
export async function importSales(formData: FormData) {
  const brandId = String(formData.get("brand_id"));
  const startDate = String(formData.get("start_date"));
  const endDate = String(formData.get("end_date"));
  const path = resultsPath(brandId);

  if (!startDate || !endDate) back(path, "error", "Choose a start and end date.");

  const supabase = await createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, client_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand) back(path, "error", "That brand was not found.");

  let result;
  try {
    result = await importForClient(supabase, brand!.client_id as string, startDate, endDate);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    back(path, "error", message);
  }

  back(path, "notice", importNotice(result!));
}
