import nodemailer from "nodemailer";

// Retry function for handling SMTP timeouts in serverless environments
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delay = 1000): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a timeout or connection error that might benefit from retry
      const errorMessage = lastError.message.toLowerCase();
      const isRetryableError = errorMessage.includes('timeout') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('451') ||
                              errorMessage.includes('esocket');
      
      if (i === maxRetries || !isRetryableError) {
        throw lastError;
      }
      
      // Wait before retrying, with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export function getTransport() {
  const host = process.env.SMTP_HOST as string;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER as string;
  const pass = process.env.SMTP_PASS as string;

  if (!host || !user || !pass) {
    throw new Error("SMTP credentials are not configured");
  }

  const transportConfig = {
    host,
    port,
    secure: port === 465, // true for 465, false for others
    auth: {
      user,
      pass
    },
    // Serverless-friendly settings for Vercel
    pool: false, // Disable connection pooling for serverless
    maxConnections: 1, // Single connection
    maxMessages: 1, // One message per connection
    connectionTimeout: 30000, // 30 seconds
    greetingTimeout: 30000, // 30 seconds
    socketTimeout: 30000, // 30 seconds
    tls: {
      rejectUnauthorized: false // For compatibility with some SMTP servers
    }
  };

  return nodemailer.createTransport(transportConfig);
}

function fromAddress() {
  // If SMTP_FROM contains a full name + email, use it directly; otherwise fall back to user
  return process.env.SMTP_FROM || `Himanshu Kukreja <${process.env.SMTP_USER}>`;
}

export async function sendRawEmail(to: string, subject: string, html: string) {
  return withRetry(async () => {
    const transporter = getTransport();
    try {
      const result = await transporter.sendMail({ 
        from: fromAddress(), 
        to, 
        subject, 
        html 
      });
      return result;
    } finally {
      // Ensure connection is closed in serverless environments
      transporter.close();
    }
  });
}

export async function sendNewsletterEmail(to: string, subject: string, html: string) {
  return sendRawEmail(to, subject, html);
}

export async function sendBulk(emails: string[], subject: string, htmlFor: (email: string) => string) {
  // In serverless environments, send emails sequentially to avoid connection issues
  const results = [];
  for (const to of emails) {
    try {
      const result = await withRetry(async () => {
        const transporter = getTransport();
        try {
          const html = htmlFor(to);
          const result = await transporter.sendMail({ from: fromAddress(), to, subject, html });
          return result;
        } finally {
          transporter.close();
        }
      });
      results.push(result);
    } catch (error) {
      // Log the error but continue with other emails
      console.error(`Failed to send email to ${to}:`, error);
      throw error; // Re-throw to let caller handle
    }
  }
  return results;
}