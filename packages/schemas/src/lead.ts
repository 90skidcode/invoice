import { z } from 'zod';
import { IsoDateTimeSchema, MoneySchema, UuidSchema } from './common.js';
import { GstRegTypeSchema } from './customer.js';

// Status is a DB-driven picklist (lead_statuses.slug) rather than a fixed
// enum, so any org-defined slug is accepted here — same treatment as
// PaymentModeSchema. 'lost' and 'converted' remain reserved slugs the
// backend depends on (see lead.service.ts).
export const LeadStatusSchema = z.string().min(1).max(20);

export const CreateLeadInputSchema = z.object({
  client_id: UuidSchema,
  name: z.string().min(1).max(120),
  phone: z.string().min(10).max(15),
  email: z.string().email().max(120).nullable().optional(),
  company_name: z.string().max(120).nullable().optional(),
  source_id: UuidSchema.nullable().optional(),
  status: LeadStatusSchema.default('new'),
  assigned_to: UuidSchema.nullable().optional(),
  expected_value: MoneySchema.nullable().optional(),
  next_follow_up_at: IsoDateTimeSchema.nullable().optional(),
  referred_by_customer_id: UuidSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tag_ids: z.array(UuidSchema).optional(),
  new_tag_names: z.array(z.string().min(1).max(40)).optional(),
});

export const UpdateLeadInputSchema = CreateLeadInputSchema.partial().omit({
  client_id: true,
});

export const LogFollowUpInputSchema = z.object({
  next_follow_up_at: IsoDateTimeSchema.nullable().optional(),
  status: LeadStatusSchema,
  note: z.string().max(2000).nullable().optional(),
  tag_ids: z.array(UuidSchema).optional(),
  new_tag_names: z.array(z.string().min(1).max(40)).optional(),
});

export const ConvertLeadInputSchema = z.object({
  client_id: UuidSchema,
  gstin: z.string().max(15).nullable().optional(),
  gst_reg_type: GstRegTypeSchema.optional(),
  credit_limit: MoneySchema.optional(),
  credit_days: z.number().int().min(0).optional(),
});

export const CreateLeadTagInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(40),
  color: z.string().max(50).optional(),
});

export const CreateLeadSourceInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  badge_color: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
});

export const UpdateLeadSourceInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  badge_color: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const CreateLeadStatusInputSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(20),
  badge_color: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
});

export const UpdateLeadStatusInputSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  badge_color: z.string().max(50).optional(),
  order_index: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type CreateLeadInput = z.infer<typeof CreateLeadInputSchema>;
export type UpdateLeadInput = z.infer<typeof UpdateLeadInputSchema>;
export type LogFollowUpInput = z.infer<typeof LogFollowUpInputSchema>;
export type ConvertLeadInput = z.infer<typeof ConvertLeadInputSchema>;
export type CreateLeadTagInput = z.infer<typeof CreateLeadTagInputSchema>;
export type CreateLeadSourceInput = z.infer<typeof CreateLeadSourceInputSchema>;
export type UpdateLeadSourceInput = z.infer<typeof UpdateLeadSourceInputSchema>;
export type CreateLeadStatusInput = z.infer<typeof CreateLeadStatusInputSchema>;
export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatusInputSchema>;
