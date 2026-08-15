require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const { Resend } = require("resend");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const FORM_WINDOW_MS = 15 * 60 * 1000;
const FORM_MAX_REQUESTS = 8;
const CSRF_COOKIE_NAME = "bw_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const REQUIRE_ORIGIN_CHECK = process.env.REQUIRE_ORIGIN_CHECK !== "false";
const isSecureCookie =
  process.env.NODE_ENV === "production" ||
  process.env.CSRF_COOKIE_SECURE === "true";
const formRequestBuckets = new Map();
const allowedOrigins = new Set(
  (
    process.env.ALLOWED_ORIGINS ||
    "https://www.bwrecycling.com.au,http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean),
);

const requiredEmailVars = ["RESEND_API_KEY", "CONTACT_FORM_TO"];

const missingEmailVars = requiredEmailVars.filter((key) => !process.env[key]);

let resendClient = null;
if (missingEmailVars.length === 0) {
  resendClient = new Resend(process.env.RESEND_API_KEY);
  console.log("Resend email service initialized and ready.");
} else {
  console.error(
    `Resend is disabled. Missing env vars: ${missingEmailVars.join(", ")}`,
  );
}

function normalizeText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function stripHeaderUnsafeChars(value) {
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((accumulator, cookie) => {
      const splitIndex = cookie.indexOf("=");
      if (splitIndex === -1) return accumulator;

      const key = cookie.slice(0, splitIndex).trim();
      const value = cookie.slice(splitIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function safeTokenEqual(tokenA, tokenB) {
  const normalizedTokenA = String(tokenA || "");
  const normalizedTokenB = String(tokenB || "");

  if (!normalizedTokenA || !normalizedTokenB) return false;

  const bufferA = Buffer.from(normalizedTokenA);
  const bufferB = Buffer.from(normalizedTokenB);

  if (bufferA.length !== bufferB.length) return false;

  return crypto.timingSafeEqual(bufferA, bufferB);
}

function getRequestOrigin(req) {
  const originHeader = req.get("origin");
  if (originHeader) {
    return originHeader.trim().toLowerCase();
  }

  const refererHeader = req.get("referer");
  if (!refererHeader) {
    return "";
  }

  try {
    return new URL(refererHeader).origin.toLowerCase();
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value) {
  return /^[0-9+()\-\s]{6,25}$/.test(value);
}

function isRateLimited(ipAddress) {
  const now = Date.now();

  for (const [bucketIp, timestamps] of formRequestBuckets.entries()) {
    const hasRecentEntry = timestamps.some(
      (timestamp) => now - timestamp < FORM_WINDOW_MS,
    );

    if (!hasRecentEntry) {
      formRequestBuckets.delete(bucketIp);
    }
  }

  const bucket = formRequestBuckets.get(ipAddress) || [];
  const recentRequests = bucket.filter(
    (timestamp) => now - timestamp < FORM_WINDOW_MS,
  );

  if (recentRequests.length >= FORM_MAX_REQUESTS) {
    formRequestBuckets.set(ipAddress, recentRequests);
    return true;
  }

  recentRequests.push(now);
  formRequestBuckets.set(ipAddress, recentRequests);
  return false;
}

// Middleware to parse incoming form data and JSON.
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true, limit: "20kb" }));

app.set("trust proxy", process.env.TRUST_PROXY === "true");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
  next();
});

// Serve static assets (CSS and Images)
app.use("/CSS", express.static(path.join(__dirname, "CSS")));
app.use("/Images", express.static(path.join(__dirname, "Images")));

// Default route to serve the homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "HTML", "index.html"));
});

// Redirect legacy or alternate homepage URLs to the canonical homepage
app.get(
  ["/biloela waste and recycling.html", "/biloela-waste-and-recycling.html"],
  (req, res) => {
    // Redirect explicitly to the new domain name
    res.redirect(301, "https://www.bwrecycling.com.au/");
  },
);

// Serve HTML files directly (must come after specific routes)
app.use(express.static(path.join(__dirname, "HTML")));
app.use("/HTML", express.static(path.join(__dirname, "HTML")));

app.get("/api/csrf-token", (req, res) => {
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const secureAttribute = isSecureCookie ? " Secure;" : "";

  res.setHeader(
    "Set-Cookie",
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; Path=/; Max-Age=3600; SameSite=Strict; HttpOnly;${secureAttribute}`,
  );
  res.setHeader("Cache-Control", "no-store");

  res.json({ csrfToken });
});

// Handle Contact Form Submission
app.post("/submit-form", async (req, res) => {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const requestOrigin = getRequestOrigin(req);

  // Allow localhost requests even without explicit origin header
  const isLocalhost =
    clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost";
  const originIsAllowed =
    !requestOrigin || allowedOrigins.has(requestOrigin) || isLocalhost;

  if (REQUIRE_ORIGIN_CHECK && !originIsAllowed && requestOrigin) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  const cookies = parseCookies(req.headers.cookie);
  const csrfTokenFromCookie = cookies[CSRF_COOKIE_NAME] || "";
  const csrfTokenFromHeader = stripHeaderUnsafeChars(req.get(CSRF_HEADER_NAME));

  if (!safeTokenEqual(csrfTokenFromCookie, csrfTokenFromHeader)) {
    return res.status(403).json({ error: "Invalid CSRF token." });
  }

  if (isRateLimited(clientIp)) {
    return res
      .status(429)
      .json({ error: "Too many requests. Please try again later." });
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      error: "Malformed request body. Please submit valid form data.",
    });
  }

  if (!resendClient) {
    console.error(`[${requestId}] Resend email service unavailable.`);
    return res.status(503).json({
      error: "Service temporarily unavailable. Please try again later.",
    });
  }

  const { Name, Phone, Email, Message, website, Website } = req.body;

  // Honeypot trap for basic bot submissions.
  if (website || Website) {
    return res.status(200).json({ message: "Form submission received." });
  }

  const normalizedName = normalizeText(Name, 120);
  const normalizedPhone = normalizeText(Phone, 25);
  const normalizedEmail = normalizeText(Email, 255).toLowerCase();
  const normalizedMessage = normalizeText(Message, 4000);

  const safeName = stripHeaderUnsafeChars(normalizedName);
  const safeEmail = stripHeaderUnsafeChars(normalizedEmail);

  if (
    !normalizedName ||
    !normalizedPhone ||
    !normalizedEmail ||
    !normalizedMessage
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  if (!isValidPhone(normalizedPhone)) {
    return res.status(400).json({ error: "Invalid phone format." });
  }

  const escapedName = escapeHtml(safeName);
  const escapedPhone = escapeHtml(normalizedPhone);
  const escapedEmail = escapeHtml(safeEmail);
  const escapedMessage = escapeHtml(normalizedMessage);

  const subject = `New contact form enquiry from ${safeName}`;
  const textBody = [
    "A new enquiry has been submitted via the website contact form.",
    "",
    `Name: ${safeName}`,
    `Phone: ${normalizedPhone}`,
    `Email: ${safeEmail}`,
    "",
    "Message:",
    normalizedMessage,
    "",
    `Request ID: ${requestId}`,
    `IP: ${clientIp}`,
  ].join("\n");

  const htmlBody = `
    <div style="background-color:#f5f5f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#333333;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;border-collapse:separate;border-spacing:0;">
        <tr>
          <td>
            <div style="background-color:#4a0638;color:#ffffff;padding:20px 24px;border-radius:8px 8px 0 0;">
              <div style="font-size:24px;font-weight:bold;letter-spacing:0.04em;">Biloela Waste & Recycling</div>
            </div>
            <div style="background-color:#ffffff;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;padding:28px 24px;line-height:1.7;">
              <p style="margin:0 0 20px;font-size:16px;color:#333333;">
                A new enquiry has been submitted via the website contact form.
              </p>

              <p style="margin:0 0 12px;">
                <strong style="color:#4a0638;">Name:</strong> ${escapedName}<br>
                <strong style="color:#4a0638;">Phone:</strong> ${escapedPhone}<br>
                <strong style="color:#4a0638;">Email:</strong> ${escapedEmail}
              </p>

              <div style="margin-top:18px;">
                <div style="color:#4a0638;font-weight:bold;margin-bottom:8px;">Message:</div>
                <div style="background-color:#f9f2f7;border-left:4px solid #4a0638;border-radius:4px;padding:16px 18px;color:#333333;white-space:pre-wrap;">${escapedMessage.replace(/\n/g, "<br>")}</div>
              </div>

              <p style="margin:20px 0 0;font-size:12px;color:#555555;line-height:1.6;">
                <strong>Request ID:</strong> ${escapeHtml(requestId)}<br>
                <strong>IP:</strong> ${escapeHtml(clientIp)}
              </p>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;

  try {
    await resendClient.emails.send({
      from: "onboarding@resend.dev",
      to: process.env.CONTACT_FORM_TO,
      replyTo: safeEmail,
      subject,
      html: htmlBody,
    });
  } catch (error) {
    console.error(
      `[${requestId}] Failed to send contact email:`,
      error.message,
    );
    return res.status(502).json({
      error: "Unable to send your message right now. Please try again.",
    });
  }

  res.status(200).json({ message: "Form submission received successfully!" });
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
