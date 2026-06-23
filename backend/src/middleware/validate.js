// Input validation helper.
// Security doc: "Validate and Transform Data: Check that the data from the app
// is correct." Collects express-validator results into a 422 response.
import { validationResult } from 'express-validator';

export function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({
      error: 'validation_failed',
      details: result.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}
