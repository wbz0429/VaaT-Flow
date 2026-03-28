import { cache } from "react";

import { getApplianceSessionFromCookies } from "./appliance";
import { getLocalDevSessionFromCookies } from "./local-dev";

const ALLO_MODE = process.env.ALLO_MODE ?? "development";

export const getSession = cache(async () => {
  if (ALLO_MODE === "appliance") {
    return getApplianceSessionFromCookies();
  }
  return getLocalDevSessionFromCookies();
});
