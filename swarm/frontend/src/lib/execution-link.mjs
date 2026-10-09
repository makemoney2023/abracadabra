export function executionIdFromSearch(search) {
  const value = new URLSearchParams(search).get("executionId");
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
