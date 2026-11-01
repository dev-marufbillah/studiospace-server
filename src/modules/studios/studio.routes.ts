import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import {
  handleCreateStudio,
  handleDeleteStudio,
  handleFeaturedStudios,
  handleGetStudio,
  handleListStudios,
  handleMyListings,
  handleUpdateStudio,
} from "./studio.controller";
import {
  studioCreateSchema,
  studioQuerySchema,
  studioUpdateSchema,
} from "./studio.validation";

/** /api/studios */
export const studioRouter = Router();

studioRouter.get("/", validate(studioQuerySchema, "query"), handleListStudios);
studioRouter.get("/featured", handleFeaturedStudios);
studioRouter.get("/:id", handleGetStudio);
studioRouter.post("/", authenticate, validate(studioCreateSchema), handleCreateStudio);
studioRouter.put("/:id", authenticate, validate(studioUpdateSchema), handleUpdateStudio);
studioRouter.delete("/:id", authenticate, handleDeleteStudio);

/** /api/my-listings */
export const myListingsRouter = Router();
myListingsRouter.get("/", authenticate, handleMyListings);
