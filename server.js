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

// Handle Contact Form Submission
app.post("/submit-form", async (req, res) => {
  const { Name, Phone, Email, Message } = req.body;

  // Set up Nodemailer transporter (Replace with your actual email SMTP credentials)
  const transporter = nodemailer.createTransport({
    host: "mail.bwrecycling.com.au", // Replace with your actual SMTP host (e.g., smtp.office365.com, smtp.gmail.com, or mail.bwrecycling.com.au)
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: "admin@bwrecycling.com.au", // Your sending email address
      pass: "YOUR_EMAIL_PASSWORD", // Your email password or app password
    },
  });

  try {
    await transporter.sendMail({
      from: `"Website Contact Form" <admin@bwrecycling.com.au>`, // Sender address
      to: "admin@bwrecycling.com.au", // Where you want to receive the inquiries
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
