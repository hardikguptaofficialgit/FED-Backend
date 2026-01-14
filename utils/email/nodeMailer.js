// RESEND API IMPLEMENTATION WITH FALLBACK
// Replaced Nodemailer with Resend API for email sending
// Supports multiple sender domains with automatic fallback
// Date: January 2026

const { resend } = require("../../config/resend");

/**
 * Get list of sender emails from environment variables
 * Supports EMAIL_FROM, EMAIL_FROM_2, EMAIL_FROM_3, etc.
 * @returns {Array<string>} Array of sender emails
 */
function getSenderEmails() {
  const senders = [];

  // Primary sender
  if (process.env.EMAIL_FROM) {
    senders.push(process.env.EMAIL_FROM);
  }

  // Secondary sender
  if (process.env.EMAIL_FROM_2) {
    senders.push(process.env.EMAIL_FROM_2);
  }

  // Tertiary sender
  if (process.env.EMAIL_FROM_3) {
    senders.push(process.env.EMAIL_FROM_3);
  }

  // Add more as needed (EMAIL_FROM_4, EMAIL_FROM_5, etc.)
  for (let i = 4; i <= 10; i++) {
    const envKey = `EMAIL_FROM_${i}`;
    if (process.env[envKey]) {
      senders.push(process.env[envKey]);
    }
  }

  // Default fallback if no senders configured
  if (senders.length === 0) {
    senders.push('FED KIIT Compliance <noreply@fedkiit.com>');
  }

  return senders;
}

/**
 * Send email using Resend API with automatic fallback to secondary domains
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlContent - HTML content of the email
 * @param {string} textContent - Plain text content (optional, auto-generated from HTML if not provided)
 * @param {Array} attachments - Array of attachment objects (optional)
 *                              Format: [{ filename: 'file.pdf', content: Buffer }]
 */
async function sendMail(to, subject, htmlContent, textContent, attachments = []) {
  // Get all configured sender emails
  const senderEmails = getSenderEmails();

  // Convert attachments to Resend format if present
  const resendAttachments = attachments.map(att => ({
    filename: att.filename,
    content: att.content,
  }));

  // Build base email options
  const baseEmailOptions = {
    to: to,
    subject: subject,
    html: htmlContent,
    text: textContent || htmlContent.replace(/<[^>]+>/g, ""),
    reply_to: "fedkiit@gmail.com",
  };

  // Add attachments if present
  if (resendAttachments.length > 0) {
    baseEmailOptions.attachments = resendAttachments;
  }

  // Try each sender in sequence until one succeeds
  let lastError = null;

  for (let i = 0; i < senderEmails.length; i++) {
    const senderEmail = senderEmails[i];
    const isLastAttempt = i === senderEmails.length - 1;

    try {
      console.log(`[Resend] Attempting to send email using sender ${i + 1}: ${senderEmail}`);

      const emailOptions = {
        ...baseEmailOptions,
        from: senderEmail,
      };

      const { data, error } = await resend.emails.send(emailOptions);

      if (error) {
        console.error(`[Resend] Sender ${i + 1} failed:`, error.message);
        lastError = error;

        if (!isLastAttempt) {
          console.log(`[Resend] Trying fallback sender...`);
          continue; // Try next sender
        }
      } else {
        console.log(`[Resend] Email sent successfully via sender ${i + 1}:`, data);
        return data;
      }
    } catch (error) {
      console.error(`[Resend] Sender ${i + 1} threw exception:`, error.message);
      lastError = error;

      if (!isLastAttempt) {
        console.log(`[Resend] Trying fallback sender...`);
        continue; // Try next sender
      }
    }
  }

  // All senders failed
  console.error("[Resend] All email senders failed. Last error:", lastError);
  throw new Error(`Email sending failed after trying ${senderEmails.length} sender(s): ${lastError?.message || 'Unknown error'}`);
}

module.exports = { sendMail };


/* ============================================================
   ORIGINAL NODEMAILER IMPLEMENTATION (COMMENTED OUT)
   ============================================================
   
const { primary, secondary, tertiary, mailerSend } = require("../../config/nodeMailer");

function sendMail(to, subject, htmlContent, textContent, attachments = []) {
  const mailDetails = {
    from: `"FED KIIT Compliance" <${process.env.MAIL_USER}>`,
    to,
    subject,
    replyTo: "fedkiit@gmail.com",
    html: htmlContent,
    text: textContent || htmlContent.replace(/<[^>]+>/g, ""),
    ...(attachments.length > 0 && { attachments }),
  };

  // Try sending with primary
  primary.sendMail(mailDetails, (err, info) => {
    if (err) {
      console.error("Primary email failed:", err);

      // Try fallback sender
      const fallbackDetails = {
        ...mailDetails,
        from: process.env.MAIL_USER_SECONDARY,
      };

      secondary.sendMail(fallbackDetails, (err2, info2) => {
        if (err2) {
          console.error("Secondary email also failed:", err2);

          // Try tertiary sender
          const tertiaryDetails = {
            ...mailDetails,
            from: process.env.MAIL_USER_TERTIARY,
          };
          tertiary.sendMail(tertiaryDetails, (err3, info3) => {
            if (err3) {
              mailerSend.sendMail({ ...mailDetails, from: '"FED KIIT Compliance" <support@fedkiit.com>' }, (err4, info4) => {
                if (err4) {
                  console.error("MailerSend email also failed:", err4);
                } else {
                  console.log("MailerSend email sent successfully:", info4);
                }
              });
              console.error("Tertiary email also failed:", err3);
            }
            else {
              console.log("Tertiary email sent successfully:", info3);
            }
          });
        } else {
          console.log("Fallback email sent successfully:", info2);
        }
      });

    } else {
      console.log("Primary email sent successfully:", info);
    }
  });
}

module.exports = { sendMail };

============================================================ */
