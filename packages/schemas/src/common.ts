import { z } from 'zod';

// Money: string-encoded decimal with exactly 2 decimal places
export const MoneySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a valid money amount (e.g. "1234.56")');

// Quantity: string-encoded decimal with up to 3 decimal places
export const QuantitySchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Must be a valid quantity (e.g. "10.500")');

// UUID v7 or any UUID
export const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Must be a valid UUID',
  );

// ISO date string YYYY-MM-DD
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

// ISO datetime string
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

// Phone (E.164 India)
export const PhoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Must be a valid Indian mobile number (+91XXXXXXXXXX)');

// GSTIN
export const GstinSchema = z
  .string()
  .regex(
    /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    'Must be a valid GSTIN',
  );

// PAN
export const PanSchema = z
  .string()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Must be a valid PAN');

// Pincode (India)
export const PincodeSchema = z.string().regex(/^\d{6}$/, 'Must be a 6-digit pincode');

// IFSC code
export const IfscSchema = z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Must be a valid IFSC code');

// Pagination cursor query params
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  sort: z.string().optional(),
});

// Generic paginated response wrapper
export function paginated<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: z.array(dataSchema),
    page: z.object({
      limit: z.number(),
      next_cursor: z.string().nullable(),
      has_more: z.boolean(),
    }),
  });
}

// Standard API response envelope
export function apiResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: z.object({
      request_id: z.string(),
      server_time: z.string(),
    }),
  });
}

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          field: z.string().optional(),
          code: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
    request_id: z.string(),
  }),
});

// Indian states
export const IndianStateCodeSchema = z
  .string()
  .regex(/^(0[1-9]|[1-2][0-9]|3[0-8]|97|99)$/, 'Must be a valid Indian state code');
