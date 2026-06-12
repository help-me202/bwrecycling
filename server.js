require("dotenv").config();
const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse incoming form data and JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  const { Name, Phone, Email, Message } = req.body;

  try {
    await transporter.sendMail({
      from: `"Website Contact Form" <${process.env.EMAIL_USER}>`, // Sender address
      to: process.env.EMAIL_USER, // Where you want to receive the inquiries
      subject: `New Enquiry from ${Name}`,
      text: `Name: ${Name}\nPhone: ${Phone}\nEmail: ${Email}\n\nMessage:\n${Message}`,
    });

    res.status(200).json({ message: "Email sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email." });
  }
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
