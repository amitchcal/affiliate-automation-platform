// Route entry point. The overview lives in core; the module list is supplied here,
// because only src/app may see every module.
import BrandOverview from "@/core/screens/BrandOverview";
import { MODULES } from "@/modules";

export default function BrandOverviewRoute(props: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  return <BrandOverview {...props} modules={MODULES} />;
}
