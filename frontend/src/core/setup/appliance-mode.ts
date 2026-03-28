export const ALLO_MODE = process.env.NEXT_PUBLIC_ALLO_MODE ?? process.env.ALLO_MODE ?? "development";

export function isApplianceMode(): boolean {
  return ALLO_MODE === "appliance";
}
