import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/ApiResponse";
import { getValidated, getPathParam } from "../../middleware/validate";
import {
  createStudio,
  deleteStudio,
  getStudio,
  listFeaturedStudios,
  listMyStudios,
  listStudios,
  updateStudio,
} from "./studio.service";
import type {
  StudioCreateInput,
  StudioQueryInput,
  StudioUpdateInput,
} from "./studio.validation";
import type { AuthUser } from "../../utils/jwt";

function requireUser(req: Request): AuthUser {
  if (!req.user) {
    throw new Error("authenticate middleware must run before this handler");
  }
  return req.user;
}

export async function handleListStudios(req: Request, res: Response): Promise<void> {
  const query = getValidated<StudioQueryInput>(req, "query");
  const result = await listStudios(query);
  sendSuccess(res, "Studios fetched successfully", result);
}

export async function handleFeaturedStudios(_req: Request, res: Response): Promise<void> {
  const studios = await listFeaturedStudios();
  sendSuccess(res, "Featured studios fetched successfully", { studios });
}

export async function handleGetStudio(req: Request, res: Response): Promise<void> {
  const studio = await getStudio(getPathParam(req, "id"));
  sendSuccess(res, "Studio fetched successfully", { studio });
}

export async function handleCreateStudio(req: Request, res: Response): Promise<void> {
  const input = getValidated<StudioCreateInput>(req, "body");
  const studio = await createStudio(input, requireUser(req));
  sendSuccess(res, "Studio created successfully", { studio }, 201);
}

export async function handleUpdateStudio(req: Request, res: Response): Promise<void> {
  const input = getValidated<StudioUpdateInput>(req, "body");
  const studio = await updateStudio(getPathParam(req, "id"), input, requireUser(req));
  sendSuccess(res, "Studio updated successfully", { studio });
}

export async function handleDeleteStudio(req: Request, res: Response): Promise<void> {
  await deleteStudio(getPathParam(req, "id"), requireUser(req));
  sendSuccess(res, "Studio deleted successfully");
}

export async function handleMyListings(req: Request, res: Response): Promise<void> {
  const studios = await listMyStudios(requireUser(req));
  sendSuccess(res, "Your listings fetched successfully", { studios });
}
