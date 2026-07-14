export function isLocationClassifierV2Enabled(): boolean {
  return process.env.LOCATION_CLASSIFIER_V2_ENABLED === "true";
}

export function isLocationClassifierV2ShadowMode(): boolean {
  return process.env.LOCATION_CLASSIFIER_V2_SHADOW_MODE === "true";
}
