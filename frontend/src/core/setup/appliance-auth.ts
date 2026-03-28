export function shouldRequireLoginInApplianceMode(setupCompleted: boolean): boolean {
  return !setupCompleted;
}

export function getApplianceNavigationTarget(setupCompleted: boolean): "/setup" | "/workspace" {
  return setupCompleted ? "/workspace" : "/setup";
}
