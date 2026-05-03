import { apiFetch } from "../config/api";

export async function listAdminVehicles() {
  return apiFetch("/api/admin/fleet/vehicles");
}

export async function createAdminVehicle(payload) {
  return apiFetch("/api/admin/fleet/vehicles", {
    method: "POST",
    body: payload,
  });
}

export async function updateAdminVehicle(id, payload) {
  if (!id) throw new Error("Vehicle id is required");
  return apiFetch(`/api/admin/fleet/vehicles/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAdminVehicle(id) {
  if (!id) throw new Error("Vehicle id is required");
  return apiFetch(`/api/admin/fleet/vehicles/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}

export async function listAdminBatteries() {
  return apiFetch("/api/admin/fleet/batteries");
}

export async function createAdminBattery(payload) {
  return apiFetch("/api/admin/fleet/batteries", {
    method: "POST",
    body: payload,
  });
}

export async function updateAdminBattery(id, payload) {
  if (!id) throw new Error("Battery id is required");
  return apiFetch(`/api/admin/fleet/batteries/${encodeURIComponent(String(id))}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deleteAdminBattery(id) {
  if (!id) throw new Error("Battery id is required");
  return apiFetch(`/api/admin/fleet/batteries/${encodeURIComponent(String(id))}`, {
    method: "DELETE",
  });
}
