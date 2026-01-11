import fs from "fs";
import path from "path";

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
 * Get welcome email content
 */
export function getWelcomeEmail(userEmail: string, siteUrl: string) {
  return {
    subject: "Welcome to System Design Mastery! 🚀",
    html: loadEmailTemplate("SUPABASE_WELCOME_EMAIL_TEMPLATE", {
      Email: userEmail,
      SiteURL: siteUrl,
    }),
  };
}
