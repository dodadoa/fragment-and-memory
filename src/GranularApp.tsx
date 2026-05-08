import { useGranularApp } from "@/hooks/useGranularApp";
import { GranularLayout } from "@/components/granular/GranularLayout";

/**
 * Layer Word — thin shell: logic in `useGranularApp`, UI in `GranularLayout`
 * and `components/granular/*`, pure audio/math in `granular/*`.
 */
export default function GranularApp() {
  return <GranularLayout {...useGranularApp()} />;
}
