import { z } from "zod";

export const passwordRules = {
  minLength: (pw: string) => pw.length >= 8,
  uppercase: (pw: string) => /[A-Z]/.test(pw),
  lowercase: (pw: string) => /[a-z]/.test(pw),
  digit:     (pw: string) => /[0-9]/.test(pw),
  special:   (pw: string) => /[^A-Za-z0-9]/.test(pw),
};

export function passwordValid(pw: string): boolean {
  return Object.values(passwordRules).every((fn) => fn(pw));
}

export const passwordSchema = z
  .string()
  .refine(passwordValid, "A senha não atende aos critérios de segurança");
