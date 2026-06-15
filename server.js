require("dotenv").config();
const express = require("express");
const path = require("path");

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

  res.status(200).json({ message: "Form submission received successfully!" });
});

// Start the server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});
