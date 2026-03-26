import { cache } from "react";

import { getLocalDevSessionFromCookies } from "./local-dev";

const ALLO_MODE = process.env.ALLO_MODE ?? "development";

// TODO(Task 4.2): In appliance mode, initialize real Better Auth with Postgres adapter.
// For now, both modes use the same local-dev implementation for session retrieval.
export const getSession = cache(async () => {
  if (ALLO_MODE === "appliance") {
    // TODO(Task 4.2): Use real Better Auth session lookup with Postgres
    return null;
  }
  return getLocalDevSessionFromCookies();
});
