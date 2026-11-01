import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../../config/database";
import { validate } from "../../middleware/validate";
import { sendSuccess } from "../../utils/ApiResponse";

/**
 * POST /api/newsletter — public newsletter signup used by the footer
 * form. Stores the address in the `newsletter` collection (unique per
 * email) so subscriptions are real, not simulated.
 */
const subscribeSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
});

export const newsletterRouter = Router();

newsletterRouter.post("/", validate(subscribeSchema), async (req, res) => {
  const { email } = req.validated?.body as z.infer<typeof subscribeSchema>;
  const normalized = email.toLowerCase().trim();

  const result = await getDatabase()
    .collection("newsletter")
    .updateOne(
      { email: normalized },
      {
        $setOnInsert: { email: normalized, subscribedAt: new Date() },
      },
      { upsert: true }
    );

  sendSuccess(
    res,
    result.upsertedCount > 0
      ? "Subscribed to the newsletter"
      : "Already subscribed to the newsletter",
    { subscribed: result.upsertedCount > 0 },
    result.upsertedCount > 0 ? 201 : 200
  );
});
