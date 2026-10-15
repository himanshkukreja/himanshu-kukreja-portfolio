import fs from "fs";
import path from "path";
import { welcomeEmail } from "@/lib/email/welcome";

/**
 * Load and process email template with variable substitution
 */
export function loadEmailTemplate(
  templateName: string,
  variables: Record<string, string>
): string {
  const templatePath = path.join(
    process.cwd(),
    `${templateName}.html`
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Email template not found: ${templateName}`);
  }

  let html = fs.readFileSync(templatePath, "utf-8");

  // Replace all Supabase-style variables {{ .VariableName }}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{\\s*\\.${key}\\s*\\}\\}`, "g");
    html = html.replace(regex, value || "");
  });

  return html;
}

/**
 * Welcome email content. Kept for old callers; the template lives in src/lib/email/welcome.ts
 * (the Supabase HTML file this used to load is no longer used for the welcome email).
 */
export function getWelcomeEmail(userEmail: string, _siteUrl?: string, name?: string | null) {
  return welcomeEmail({ email: userEmail, name });
}
