import { apiFetch } from "../config/api";

export async function listAdminZones() {
  return apiFetch("/api/admin/zones");
}

export async function createAdminZone(payload) {
  return apiFetch("/api/admin/zones", {
    method: "POST",
    body: payload,
  });
}

export async function updateAdminZone(id, payload) {
  if (!id) throw new Error("Zone id is required");
  return apiFetch(`/api/admin/zones/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAdminZone(id) {
  if (!id) throw new Error("Zone id is required");
  return apiFetch(`/api/admin/zones/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}

export async function listAdminLocations() {
  return apiFetch("/api/admin/locations");
}

export async function createAdminCountry(payload) {
  return apiFetch("/api/admin/locations/countries", {
    method: "POST",
    body: payload,
  });
}

export async function createAdminState(payload) {
  return apiFetch("/api/admin/locations/states", {
    method: "POST",
    body: payload,
  });
}

export async function createAdminCity(payload) {
  return apiFetch("/api/admin/locations/cities", {
    method: "POST",
    body: payload,
  });
}

export async function createAdminArea(payload) {
  return apiFetch("/api/admin/locations/areas", {
    method: "POST",
    body: payload,
  });
}

export async function geocodeAdminCity(payload = {}) {
  const params = new URLSearchParams();
  const countryCode = String(payload.countryCode ?? payload.country_code ?? "").trim();
  const stateCode = String(payload.stateCode ?? payload.state_code ?? "").trim();
  const cityName = String(payload.cityName ?? payload.city_name ?? "").trim();

  if (countryCode) params.set("countryCode", countryCode);
  if (stateCode) params.set("stateCode", stateCode);
  if (cityName) params.set("cityName", cityName);

  const qs = params.toString();
  return apiFetch(`/api/admin/locations/geocode${qs ? `?${qs}` : ""}`);
}
