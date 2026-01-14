import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

export const RequestEmailValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail().trim(),
  })
)

export const passwordResetValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail().trim(),
    token: vine.string().trim(),
    password: vine.string().minLength(8).maxLength(32).trim().confirmed(),
  })
)

export const authPasswordUpdateValidator = vine.compile(
  vine.object({
    currentPassword: vine.string().minLength(8).maxLength(32).trim(),
    password: vine.string().minLength(8).maxLength(32).trim().confirmed(),
  })
)

export const authUpdateValidator = vine.compile(
  vine.object({
    email: vine.string().email().normalizeEmail().trim().optional(),
    name: vine.string().minLength(3).maxLength(96).trim().optional(),
    lastName: vine.string().minLength(3).maxLength(128).trim().optional(),
    password: vine.string().minLength(8).maxLength(32).trim().confirmed().optional(),
    settings: vine.object({}).allowUnknownProperties().optional(),
  })
)

export const userCreateValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(3).maxLength(96).trim(),
    email: vine.string().email().normalizeEmail().trim(),
    password: vine.string().minLength(8).maxLength(32).trim().confirmed(),
    isActive: vine.boolean(),
    role: vine.enum(['view', 'user', 'admin', 'super'] as const),
    username: vine.string().minLength(6).maxLength(128).trim(),
    lastName: vine.string().minLength(3).maxLength(128).trim(),
    emailVerifiedAt: vine
      .date()
      .optional()
      .transform((value) => (value ? DateTime.fromJSDate(value) : null)),
  })
)

export const userUpdateValidator = vine.compile(
  vine.object({
    name: vine.string().minLength(3).maxLength(96).trim().optional(),
    email: vine.string().email().normalizeEmail().trim().optional(),
    password: vine.string().minLength(8).maxLength(32).trim().confirmed(),
    isActive: vine.boolean().optional(),
    role: vine.enum(['view', 'user', 'admin', 'super'] as const).optional(),
    username: vine.string().minLength(6).maxLength(128).trim().optional(),
    lastName: vine.string().minLength(3).maxLength(128).trim().optional(),
    lastIp: vine.string().trim().optional(),
    emailVerifiedAt: vine
      .date()
      .optional()
      .transform((value) => (value ? DateTime.fromJSDate(value) : null)),
    lastLoginAt: vine
      .date()
      .optional()
      .transform((value) => (value ? DateTime.fromJSDate(value) : null)),
  })
)

export const appKeyStoreValidator = vine.compile(
  vine.object({
    description: vine.string().minLength(3).maxLength(255).trim(),
    value: vine.string().minLength(1).trim().optional(),
    isActive: vine.boolean(),
    daysExpires: vine.number(),
    permission: vine.array(vine.string()).optional(),
  })
)

export const appKeyUpdateValidator = vine.compile(
  vine.object({
    daysExpires: vine.number().optional(),
    description: vine.string().minLength(3).maxLength(255).trim().optional(),
    permission: vine.array(vine.string()).optional(),
    isActive: vine.boolean().optional(),
  })
)

export const sendEmailValidator = vine.compile(
  vine.object({
    to: vine.string().email().trim(),
    subject: vine.string().minLength(3).maxLength(255).trim(),
    body: vine.string().minLength(1).trim(),
    cc: vine.array(vine.string().email()).optional(),
    bcc: vine.array(vine.string().email()).optional(),
    from: vine
      .object({
        address: vine.string().email().trim(),
        name: vine.string().minLength(1).trim().optional(),
      })
      .optional(),
    replyTo: vine.string().email().trim().optional(),
    attachments: vine
      .array(
        vine.object({
          filename: vine.string().minLength(1),
          path: vine.string().url().optional(),
          content: vine.string().optional(),
          contentType: vine.string().optional(),
        })
      )
      .optional(),
    isHtml: vine.boolean().optional(),
    priority: vine.enum(['high', 'normal', 'low'] as const).optional(),
  })
)
