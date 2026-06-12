require("dotenv").config();
const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming form data and JSON and capture raw body for debugging
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (buf && buf.length) req.rawBody = buf.toString();
    },
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
      if (buf && buf.length) req.rawBody = buf.toString();
    },
  }),
);

// Serve static assets (CSS and Images)
app.use("/CSS", express.static(path.join(__dirname, "CSS")));
app.use("/Images", express.static(path.join(__dirname, "Images")));

// Serve HTML files directly
app.use(express.static(path.join(__dirname, "HTML")));

// Default route to serve the homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "HTML", "Index.html"));
});

// Set up Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Helps avoid self-signed certificate errors on custom mail servers
  },
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@biloelaplumbingworks.com";

// Verify connection configuration on startup
transporter.verify(function (error, success) {
  if (error) {
    console.error("SMTP Connection Error:", error);
  } else {
    console.log("Mail server is verified and ready to take messages.");
  }
});

// Handle Contact Form Submission
app.post("/submit-form", async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    console.error("Empty or malformed JSON body:", req.rawBody);
    return res.status(400).json({
      error: "Malformed request body. Please submit valid JSON.",
      rawBody: req.rawBody,
    });
  }

  const { Name, Phone, Email, Message } = req.body;

  console.log("Contact form submission:", {
    Name,
    Phone,
    Email,
    Message,
    rawBody: req.rawBody,
  });

  try {
    await transporter.sendMail({
      from: `"Website Contact Form" <${process.env.EMAIL_USER}>`, // Sender address
      to: ADMIN_EMAIL, // Send enquiries to the admin address
      replyTo: Email,
      subject: `New Enquiry from ${Name}`,
      text: `Name: ${Name}\nPhone: ${Phone}\nEmail: ${Email}\n\nMessage:\n${Message}`,
    });

    res.status(200).json({ message: "Email sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({
      error: error.message || "Failed to send email.",
    });
  }
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
